import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let prisma: any;
  let printDispatch: { dispatchOrder: jest.Mock };
  let payments: { createCheckoutSession: jest.Mock };
  let config: { get: jest.Mock };
  let service: OrdersService;

  const menuItemPizza = {
    id: 'item-pizza',
    price: 10,
    isAvailable: true,
    nameJson: { bs: 'Pizza' },
    modifiers: [
      { id: 'mod-cheese', price: 2, nameJson: { bs: 'Extra sir' } },
      { id: 'mod-olives', price: 1.5, nameJson: { bs: 'Masline' } },
    ],
  };

  const menuItemCola = {
    id: 'item-cola',
    price: 3,
    isAvailable: true,
    nameJson: { bs: 'Cola' },
    modifiers: [],
  };

  beforeEach(() => {
    prisma = {
      restaurantTable: { findFirst: jest.fn(), update: jest.fn() },
      menuItem: { findMany: jest.fn() },
      restaurant: { findUnique: jest.fn() },
      order: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    };
    printDispatch = { dispatchOrder: jest.fn() };
    payments = { createCheckoutSession: jest.fn() };
    config = { get: jest.fn() };
    service = new OrdersService(prisma, printDispatch as any, payments as any, config as any);
  });

  describe('create - obracun cijene', () => {
    it('baca BadRequestException ako sto ne pripada restoranu', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);

      await expect(
        service.create('rest-1', { table_id: 'tudji-sto', items: [{ menu_item_id: 'item-pizza', quantity: 1 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('baca BadRequestException ako artikal ne postoji u bazi', async () => {
      prisma.menuItem.findMany.mockResolvedValue([]);

      await expect(
        service.create('rest-1', { items: [{ menu_item_id: 'ne-postoji', quantity: 1 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('baca BadRequestException ako artikal nije dostupan (rasprodano)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([{ ...menuItemPizza, isAvailable: false }]);

      await expect(
        service.create('rest-1', { items: [{ menu_item_id: 'item-pizza', quantity: 1 }] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('racuna totalAmount iz CIJENA U BAZI (ne iz klijentovog payloada), ukljucujuci modifikatore', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItemPizza, menuItemCola]);
      prisma.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'order-1', ...data, table: null, restaurant: { id: 'rest-1' } }),
      );

      await service.create('rest-1', {
        items: [
          // Gost salje "price: 0.01" - ne smije uticati na obracun, servis mora
          // ignorisati sve sem menu_item_id/quantity/selected_modifiers.
          { menu_item_id: 'item-pizza', quantity: 2, selected_modifiers: [{ id: 'mod-cheese' }], price: 0.01 } as any,
          { menu_item_id: 'item-cola', quantity: 3 } as any,
        ],
      } as any);

      // pizza: (10 + 2) * 2 = 24 ; cola: 3 * 3 = 9 ; ukupno 33
      const createCall = prisma.order.create.mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(33);
    });

    it('ignorise modifikator koji nije na listi tog artikla (ne postoji u bazi za taj item)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItemCola]); // cola nema modifikatore
      prisma.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'order-1', ...data, table: null, restaurant: { id: 'rest-1' } }),
      );

      await service.create('rest-1', {
        items: [{ menu_item_id: 'item-cola', quantity: 1, selected_modifiers: [{ id: 'mod-cheese' }] } as any],
      } as any);

      expect(prisma.order.create.mock.calls[0][0].data.totalAmount).toBe(3);
    });

    it('prosljedjuje added_by iz inputa u stavke narudzbe (split-bill atribucija gosta)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItemPizza]);
      prisma.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'order-1', ...data, table: null, restaurant: { id: 'rest-1' } }),
      );

      await service.create('rest-1', {
        items: [{ menu_item_id: 'item-pizza', quantity: 1, added_by: 'guest-abc' } as any],
      } as any);

      expect(prisma.order.create.mock.calls[0][0].data.items.create[0].addedBy).toBe('guest-abc');
    });

    it('SELEKTUJE samo bezbjedna polja restorana (ne cijeli objekat sa Twilio/Stripe tajnama) - regresija za javnu takeaway rutu', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItemCola]);
      prisma.order.create.mockResolvedValue({ id: 'order-1', table: null, restaurant: { id: 'rest-1' } });

      await service.create('rest-1', { items: [{ menu_item_id: 'item-cola', quantity: 1 } as any] } as any);

      const restaurantSelect = prisma.order.create.mock.calls[0][0].include.restaurant.select;
      expect(restaurantSelect).toEqual({
        id: true,
        name: true,
        kitchenPrinterIp: true,
        kitchenPrinterPort: true,
        barPrinterIp: true,
        barPrinterPort: true,
      });
      // Eksplicitno - ne smiju biti true (bilo koje od ovoga bi znacilo da cijeli restoran ipak curi).
      expect(restaurantSelect.twilioAuthToken).toBeUndefined();
      expect(restaurantSelect.stripeSecretKey).toBeUndefined();
      expect(restaurantSelect.stripeWebhookSecret).toBeUndefined();
    });
  });

  describe('create - status odobravanja (requireOrderApproval)', () => {
    beforeEach(() => {
      prisma.menuItem.findMany.mockResolvedValue([menuItemCola]);
      prisma.order.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'order-1', ...data, table: null, restaurant: { id: 'rest-1' } }),
      );
    });

    it('gost narudzba + requireOrderApproval=true -> status pending_approval, BEZ slanja na stampu', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ requireOrderApproval: true });

      const order = await service.create(
        'rest-1',
        { items: [{ menu_item_id: 'item-cola', quantity: 1 } as any] } as any,
        { isGuestOrder: true },
      );

      expect(order.status).toBe('pending_approval');
      expect(printDispatch.dispatchOrder).not.toHaveBeenCalled();
    });

    it('gost narudzba + requireOrderApproval=false -> status pending, SALJE se na stampu', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ requireOrderApproval: false });

      const order = await service.create(
        'rest-1',
        { items: [{ menu_item_id: 'item-cola', quantity: 1 } as any] } as any,
        { isGuestOrder: true },
      );

      expect(order.status).toBe('pending');
      expect(printDispatch.dispatchOrder).toHaveBeenCalledTimes(1);
    });

    it('rucni unos konobara (isGuestOrder=false) NIKAD ne ide u pending_approval, cak i kad je ukljuceno za restoran', async () => {
      const order = await service.create('rest-1', { items: [{ menu_item_id: 'item-cola', quantity: 1 } as any] } as any);

      expect(order.status).toBe('pending');
      expect(printDispatch.dispatchOrder).toHaveBeenCalledTimes(1);
      // requireOrderApproval provjera se uopste ne izvrsava za ne-gost narudzbe
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('approveOrder / rejectOrder', () => {
    it('approveOrder prebacuje pending_approval -> pending i salje na stampu', async () => {
      const pendingOrder = {
        id: 'order-1',
        status: 'pending_approval',
        items: [],
        table: null,
        restaurant: { id: 'rest-1' },
      };
      prisma.order.findFirst.mockResolvedValue(pendingOrder);
      prisma.order.update.mockResolvedValue({ ...pendingOrder, status: 'pending' });

      const result = await service.approveOrder('rest-1', 'order-1');

      expect(result.status).toBe('pending');
      expect(printDispatch.dispatchOrder).toHaveBeenCalledTimes(1);
    });

    it('approveOrder baca NotFoundException ako narudzba nije u pending_approval (vec obradjena)', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.approveOrder('rest-1', 'order-1')).rejects.toThrow(NotFoundException);
      expect(printDispatch.dispatchOrder).not.toHaveBeenCalled();
    });

    it('rejectOrder prebacuje pending_approval -> cancelled', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'pending_approval' });
      prisma.order.update.mockResolvedValue({ id: 'order-1', status: 'cancelled' });

      const result = await service.rejectOrder('rest-1', 'order-1');

      expect(result.status).toBe('cancelled');
    });

    it('rejectOrder baca NotFoundException ako narudzba nije u pending_approval', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.rejectOrder('rest-1', 'order-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBillForTable - split the bill', () => {
    it('grupise stavke po added_by i racuna tacan subtotal po gostu i ukupno', async () => {
      prisma.restaurantTable = {
        ...prisma.restaurantTable,
        findUnique: jest.fn().mockResolvedValue({ id: 'table-1', qrCodeToken: 'tok-123' }),
      };
      prisma.order.findMany = jest.fn().mockResolvedValue([
        {
          orderNumber: 1,
          items: [
            { menuItemId: 'item-pizza', menuItem: menuItemPizza, quantity: 1, unitPrice: 10, selectedModifiers: [{ price: 2 }], addedBy: 'guest-a' },
            { menuItemId: 'item-cola', menuItem: menuItemCola, quantity: 2, unitPrice: 3, selectedModifiers: [], addedBy: 'guest-b' },
          ],
        },
        {
          orderNumber: 2,
          items: [
            { menuItemId: 'item-cola', menuItem: menuItemCola, quantity: 1, unitPrice: 3, selectedModifiers: [], addedBy: null },
          ],
        },
      ]);

      const bill = await service.getBillForTable('table-1', 'tok-123');

      // guest-a: (10+2)*1 = 12 ; guest-b: 3*2 = 6 ; unknown: 3*1 = 3 ; ukupno 21
      expect(bill.total).toBe(21);
      const byGuest = Object.fromEntries(bill.by_guest.map((g) => [g.guest_id, g.subtotal]));
      expect(byGuest['guest-a']).toBe(12);
      expect(byGuest['guest-b']).toBe(6);
      expect(byGuest['unknown']).toBe(3);
    });

    it('baca NotFoundException za pogresan qr_token', async () => {
      prisma.restaurantTable = {
        ...prisma.restaurantTable,
        findUnique: jest.fn().mockResolvedValue({ id: 'table-1', qrCodeToken: 'tacan-token' }),
      };

      await expect(service.getBillForTable('table-1', 'pogresan-token')).rejects.toThrow(NotFoundException);
    });
  });
});
