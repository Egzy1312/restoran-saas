import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let prisma: any;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn() },
      orderItem: { findMany: jest.fn() },
      restaurant: { findUnique: jest.fn() },
    };
    service = new AnalyticsService(prisma);
  });

  describe('summary', () => {
    it('racuna ukupan prihod i prosjecnu vrijednost narudzbe', async () => {
      prisma.order.findMany.mockResolvedValue([{ totalAmount: 10 }, { totalAmount: 20 }, { totalAmount: 15 }]);

      const result = await service.summary('rest-1', 7);

      expect(result.order_count).toBe(3);
      expect(result.total_revenue).toBe(45);
      expect(result.avg_order_value).toBe(15);
    });

    it('vraca 0 avg_order_value kad nema narudzbi (izbjegava dijeljenje sa 0)', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.summary('rest-1', 7);

      expect(result.order_count).toBe(0);
      expect(result.total_revenue).toBe(0);
      expect(result.avg_order_value).toBe(0);
    });

    it('zaokruzuje na 2 decimale', async () => {
      prisma.order.findMany.mockResolvedValue([{ totalAmount: 10.111 }, { totalAmount: 10.115 }]);

      const result = await service.summary('rest-1', 7);

      expect(result.total_revenue).toBe(20.23);
    });
  });

  describe('topItems', () => {
    it('agregira kolicinu i prihod po artiklu kroz vise narudzbi, sortira opadajuce po kolicini', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        { menuItemId: 'pizza', menuItem: { nameJson: { bs: 'Pizza' } }, quantity: 2, unitPrice: 10 },
        { menuItemId: 'cola', menuItem: { nameJson: { bs: 'Cola' } }, quantity: 5, unitPrice: 3 },
        { menuItemId: 'pizza', menuItem: { nameJson: { bs: 'Pizza' } }, quantity: 1, unitPrice: 10 },
      ]);

      const result = await service.topItems('rest-1', 7, 10);

      expect(result[0]).toMatchObject({ menu_item_id: 'cola', quantity: 5, revenue: 15 });
      expect(result[1]).toMatchObject({ menu_item_id: 'pizza', quantity: 3, revenue: 30 });
    });

    it('postuje limit', async () => {
      prisma.orderItem.findMany.mockResolvedValue([
        { menuItemId: 'a', menuItem: { nameJson: { bs: 'A' } }, quantity: 3, unitPrice: 1 },
        { menuItemId: 'b', menuItem: { nameJson: { bs: 'B' } }, quantity: 2, unitPrice: 1 },
        { menuItemId: 'c', menuItem: { nameJson: { bs: 'C' } }, quantity: 1, unitPrice: 1 },
      ]);

      const result = await service.topItems('rest-1', 7, 2);

      expect(result).toHaveLength(2);
    });

    it('koristi "Obrisan artikal" kad je menuItem izbrisan (relacija null)', async () => {
      prisma.orderItem.findMany.mockResolvedValue([{ menuItemId: 'obrisan', menuItem: null, quantity: 1, unitPrice: 5 }]);

      const result = await service.topItems('rest-1', 7, 10);

      expect(result[0].name).toBe('Obrisan artikal');
    });
  });

  describe('avgPrepTime', () => {
    it('racuna prosjecno vrijeme pripreme u minutama izmedju createdAt i updatedAt', async () => {
      const base = new Date('2026-01-01T12:00:00Z');
      prisma.order.findMany.mockResolvedValue([
        { createdAt: base, updatedAt: new Date(base.getTime() + 10 * 60000) },
        { createdAt: base, updatedAt: new Date(base.getTime() + 20 * 60000) },
      ]);

      const result = await service.avgPrepTime('rest-1', 7);

      expect(result.avg_minutes).toBe(15);
      expect(result.sample_size).toBe(2);
    });

    it('vraca 0/0 kad nema zavrsenih narudzbi u periodu', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.avgPrepTime('rest-1', 7);

      expect(result).toEqual({ avg_minutes: 0, sample_size: 0 });
    });
  });

  describe('tableRevenue', () => {
    it('agregira prihod i broj narudzbi po stolu, sortira opadajuce po prihodu', async () => {
      prisma.order.findMany.mockResolvedValue([
        { tableId: 't1', totalAmount: 50, table: { tableNumber: '1', zoneName: 'Terasa' } },
        { tableId: 't2', totalAmount: 100, table: { tableNumber: '2', zoneName: 'Sala' } },
        { tableId: 't1', totalAmount: 30, table: { tableNumber: '1', zoneName: 'Terasa' } },
      ]);

      const result = await service.tableRevenue('rest-1', 7, 10);

      expect(result[0]).toMatchObject({ table_id: 't2', revenue: 100, order_count: 1 });
      expect(result[1]).toMatchObject({ table_id: 't1', revenue: 80, order_count: 2 });
    });
  });
});
