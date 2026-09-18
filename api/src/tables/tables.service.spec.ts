import { NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';

describe('TablesService', () => {
  let prisma: any;
  let service: TablesService;

  beforeEach(() => {
    prisma = {
      restaurantTable: { findFirst: jest.fn(), update: jest.fn() },
      order: { findMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new TablesService(prisma);
  });

  describe('update - zatvaranje stola (status: free) razrjesava neposluzene narudzbe', () => {
    beforeEach(() => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 'table-1', restaurantId: 'rest-1' });
      prisma.restaurantTable.update.mockResolvedValue({ id: 'table-1', status: 'free' });
    });

    it('pending_approval narudzbe otkazuje, pending/preparing/ready oznacava posluzenim', async () => {
      prisma.order.findMany.mockResolvedValue([
        { id: 'order-approval', status: 'pending_approval' },
        { id: 'order-pending', status: 'pending' },
        { id: 'order-preparing', status: 'preparing' },
        { id: 'order-ready', status: 'ready' },
      ]);

      const result = await service.update('rest-1', 'table-1', { status: 'free' } as any);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-approval'] } },
        data: { status: 'cancelled' },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-pending', 'order-preparing', 'order-ready'] } },
        data: { status: 'served' },
      });
      expect(result.resolvedOrders).toEqual(
        expect.arrayContaining([
          { id: 'order-approval', status: 'cancelled' },
          { id: 'order-pending', status: 'served' },
          { id: 'order-preparing', status: 'served' },
          { id: 'order-ready', status: 'served' },
        ]),
      );
    });

    it('ne dira zavrsene narudzbe (served/cancelled) - upit ih uopste ne trazi', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.update('rest-1', 'table-1', { status: 'free' } as any);

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { tableId: 'table-1', status: { in: ['pending_approval', 'pending', 'preparing', 'ready'] } },
        select: { id: true, status: true },
      });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(result.resolvedOrders).toEqual([]);
    });

    it('nema neposluzenih narudzbi - ne pokusava prazan updateMany', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'order-1', status: 'pending' }]);

      await service.update('rest-1', 'table-1', { status: 'free' } as any);

      // Samo JEDAN updateMany poziv (za 'served') - NIJE pozvan za praznu cancelledIds listu.
      expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-1'] } },
        data: { status: 'served' },
      });
    });
  });

  it('update sa statusom koji NIJE "free" ne dira narudzbe uopste (npr. admin mijenja kapacitet stola)', async () => {
    prisma.restaurantTable.findFirst.mockResolvedValue({ id: 'table-1', restaurantId: 'rest-1' });
    prisma.restaurantTable.update.mockResolvedValue({ id: 'table-1', capacity: 6 });

    const result = await service.update('rest-1', 'table-1', { capacity: 6 } as any);

    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(result.resolvedOrders).toEqual([]);
  });

  it('baca NotFoundException ako sto ne pripada restoranu (tenant izolacija)', async () => {
    prisma.restaurantTable.findFirst.mockResolvedValue(null);
    await expect(service.update('rest-1', 'tudj-sto', { status: 'free' } as any)).rejects.toThrow(NotFoundException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
