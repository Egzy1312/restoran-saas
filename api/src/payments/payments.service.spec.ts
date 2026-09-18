import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let prisma: any;
  let encryption: any;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      restaurant: { findUnique: jest.fn() },
      order: { findFirst: jest.fn(), update: jest.fn() },
    };
    encryption = { decrypt: jest.fn((v: string) => v) };
    service = new PaymentsService(prisma, encryption);
  });

  describe('markOrderPaid - tenant izolacija', () => {
    it('oznacava narudzbu placenom kad STVARNO pripada restoranu ciji je webhook stigao', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1', restaurantId: 'rest-1' });

      await service.markOrderPaid('rest-1', 'order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { id: 'order-1', restaurantId: 'rest-1' } });
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { paymentStatus: 'paid' } });
    });

    it('NE oznacava (i ne baca gresku) narudzbu koja pripada DRUGOM restoranu - sprecava restoran X da preko svog legitimnog Stripe webhooka oznaci tudju narudzbu placenom', async () => {
      prisma.order.findFirst.mockResolvedValue(null); // findFirst sa restaurantId filterom ne nalazi tudju narudzbu

      await service.markOrderPaid('rest-x-napadac', 'order-pripada-rest-y');

      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
