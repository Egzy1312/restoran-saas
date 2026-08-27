import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShopService } from './shop.service';

describe('ShopService', () => {
  let prisma: any;
  let config: { get: jest.Mock };
  let service: ShopService;

  const printer58mm = {
    id: 'prod-58mm',
    name: 'Termalni printer 58mm',
    priceCents: 24990,
    currency: 'BAM',
    stockQty: 5,
    isActive: true,
  };
  const printer80mm = {
    id: 'prod-80mm',
    name: 'Termalni printer 80mm',
    priceCents: 34990,
    currency: 'BAM',
    stockQty: 2,
    isActive: true,
  };

  beforeEach(() => {
    prisma = {
      shopProduct: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      shopOrder: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    config = { get: jest.fn() };
    service = new ShopService(prisma, config as any);
  });

  describe('createOrder - integritet cijene', () => {
    it('racuna totalCents IZ BAZE (ne iz klijentovog payloada) i prosljedjuje snapshot naziva/cijene po stavci', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm, printer80mm]);
      let capturedData: any;
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: {
            create: jest.fn().mockImplementation(({ data }: any) => {
              capturedData = data;
              return Promise.resolve({ id: 'order-1', ...data, items: data.items.create });
            }),
          },
          shopProduct: { update: jest.fn() },
        }),
      );

      await service.createOrder({
        items: [
          { product_id: 'prod-58mm', quantity: 2 } as any, // gost "salje" quantity ali ne cijenu - cijena se NIKAD ne salje sa klijenta
          { product_id: 'prod-80mm', quantity: 1 } as any,
        ],
        customer_name: 'Test Kupac',
        customer_email: 'kupac@test.ba',
        shipping_address: 'Ulica 1, Sarajevo',
      } as any);

      // 24990*2 + 34990*1 = 84970
      expect(capturedData.totalCents).toBe(84970);
      expect(capturedData.items.create).toEqual([
        { productId: 'prod-58mm', productName: 'Termalni printer 58mm', unitPriceCents: 24990, quantity: 2 },
        { productId: 'prod-80mm', productName: 'Termalni printer 80mm', unitPriceCents: 34990, quantity: 1 },
      ]);
    });

    it('baca BadRequestException ako proizvod ne postoji ili nije aktivan', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder({
          items: [{ product_id: 'ne-postoji', quantity: 1 } as any],
          customer_name: 'T',
          customer_email: 'a@b.ba',
          shipping_address: 'Adresa',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('baca BadRequestException ako nema dovoljno zaliha', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([{ ...printer80mm, stockQty: 1 }]);

      await expect(
        service.createOrder({
          items: [{ product_id: 'prod-80mm', quantity: 5 } as any],
          customer_name: 'T',
          customer_email: 'a@b.ba',
          shipping_address: 'Adresa',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('umanjuje zalihe (stockQty) za kupljenu kolicinu unutar iste transakcije', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm]);
      const updateSpy = jest.fn();
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: { create: jest.fn().mockResolvedValue({ id: 'order-1', items: [] }) },
          shopProduct: { update: updateSpy },
        }),
      );

      await service.createOrder({
        items: [{ product_id: 'prod-58mm', quantity: 3 } as any],
        customer_name: 'T',
        customer_email: 'a@b.ba',
        shipping_address: 'Adresa',
      } as any);

      expect(updateSpy).toHaveBeenCalledWith({ where: { id: 'prod-58mm' }, data: { stockQty: { decrement: 3 } } });
    });

    it('vraca narudzbu BEZ payment_url kad Lemon Squeezy nije podesen (graciozno)', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm]);
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: { create: jest.fn().mockResolvedValue({ id: 'order-1', items: [] }) },
          shopProduct: { update: jest.fn() },
        }),
      );

      const result = await service.createOrder({
        items: [{ product_id: 'prod-58mm', quantity: 1 } as any],
        customer_name: 'T',
        customer_email: 'a@b.ba',
        shipping_address: 'Adresa',
      } as any);

      expect(result).not.toHaveProperty('payment_url');
    });

    it('pouzeće (cod) je podrazumijevano - cuva paymentMethod: "cod" bez payment_method u zahtjevu', async () => {
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm]);
      let capturedData: any;
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: {
            create: jest.fn().mockImplementation(({ data }: any) => {
              capturedData = data;
              return Promise.resolve({ id: 'order-1', ...data, items: [] });
            }),
          },
          shopProduct: { update: jest.fn() },
        }),
      );

      await service.createOrder({
        items: [{ product_id: 'prod-58mm', quantity: 1 } as any],
        customer_name: 'T',
        customer_email: 'a@b.ba',
        shipping_address: 'Adresa',
      } as any);

      expect(capturedData.paymentMethod).toBe('cod');
    });

    it('narudžba sa pouzećem NIKAD ne pokušava Lemon Squeezy checkout, čak i kad JE podešen (nema fetch poziva)', async () => {
      config.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          LEMONSQUEEZY_API_KEY: 'ls-key',
          LEMONSQUEEZY_STORE_ID: '1',
          LEMONSQUEEZY_SHOP_VARIANT_ID: '2',
        };
        return values[key];
      });
      const fetchSpy = jest.spyOn(global, 'fetch');
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm]);
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: { create: jest.fn().mockResolvedValue({ id: 'order-1', items: [] }) },
          shopProduct: { update: jest.fn() },
        }),
      );

      const result = await service.createOrder({
        items: [{ product_id: 'prod-58mm', quantity: 1 } as any],
        customer_name: 'T',
        customer_email: 'a@b.ba',
        shipping_address: 'Adresa',
        payment_method: 'cod',
      } as any);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('payment_url');
      fetchSpy.mockRestore();
    });

    it('narudžba sa "card" I podešenim Lemon Squeezy-jem vraća payment_url', async () => {
      config.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          LEMONSQUEEZY_API_KEY: 'ls-key',
          LEMONSQUEEZY_STORE_ID: '1',
          LEMONSQUEEZY_SHOP_VARIANT_ID: '2',
        };
        return values[key];
      });
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ data: { attributes: { url: 'https://checkout.lemonsqueezy.com/xyz' } } }),
      } as Response);
      prisma.shopProduct.findMany.mockResolvedValue([printer58mm]);
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          shopOrder: { create: jest.fn().mockResolvedValue({ id: 'order-1', items: [] }) },
          shopProduct: { update: jest.fn() },
        }),
      );

      const result = await service.createOrder({
        items: [{ product_id: 'prod-58mm', quantity: 1 } as any],
        customer_name: 'T',
        customer_email: 'a@b.ba',
        shipping_address: 'Adresa',
        payment_method: 'card',
      } as any);

      expect((result as any).payment_url).toBe('https://checkout.lemonsqueezy.com/xyz');
      jest.restoreAllMocks();
    });
  });

  describe('updateProduct / deleteProduct / updateOrderStatus - NotFoundException', () => {
    it('updateProduct baca NotFoundException za nepostojeci proizvod', async () => {
      prisma.shopProduct.findUnique.mockResolvedValue(null);
      await expect(service.updateProduct('ne-postoji', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });

    it('deleteProduct baca NotFoundException za nepostojeci proizvod', async () => {
      prisma.shopProduct.findUnique.mockResolvedValue(null);
      await expect(service.deleteProduct('ne-postoji')).rejects.toThrow(NotFoundException);
    });

    it('updateOrderStatus baca NotFoundException za nepostojecu narudzbu', async () => {
      prisma.shopOrder.findUnique.mockResolvedValue(null);
      await expect(service.updateOrderStatus('ne-postoji', 'shipped')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleOrderWebhook', () => {
    it('oznacava narudzbu kao "paid" i cuva Lemon Squeezy order ID', async () => {
      await service.handleOrderWebhook({
        meta: { event_name: 'order_created', custom_data: { shop_order_id: 'order-1' } },
        data: { id: 'ls-order-1' },
      });

      expect(prisma.shopOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'paid', lemonSqueezyOrderId: 'ls-order-1' },
      });
    });

    it('preskace (ne azurira nista) ako custom_data.shop_order_id nedostaje (npr. event je za pretplatu, ne webshop)', async () => {
      await service.handleOrderWebhook({
        meta: { event_name: 'order_created' },
        data: { id: 'ls-order-1' },
      });

      expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    });
  });
});
