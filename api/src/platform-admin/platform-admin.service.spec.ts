import { NotFoundException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService', () => {
  let prisma: any;
  let service: PlatformAdminService;

  beforeEach(() => {
    prisma = {
      restaurant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
      order: { count: jest.fn() },
      platformAuditLog: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new PlatformAdminService(prisma);
  });

  const actor = { id: 'super-admin-1', email: 'superadmin@platforma.test' };

  describe('listRestaurants', () => {
    it('mapira Prisma _count u ravne order_count/staff_count/table_count polja', async () => {
      prisma.restaurant.findMany.mockResolvedValue([
        {
          id: 'r1',
          name: 'Konoba A',
          slug: 'konoba-a',
          isActive: true,
          subscriptionStatus: 'trialing',
          trialEndsAt: null,
          subscriptionRenewsAt: null,
          createdAt: new Date('2026-01-01'),
          _count: { orders: 5, staffUsers: 2, tables: 3 },
        },
      ]);

      const result = await service.listRestaurants();

      expect(result[0]).toMatchObject({ id: 'r1', order_count: 5, staff_count: 2, table_count: 3, is_active: true });
    });
  });

  describe('setActive', () => {
    it('baca NotFoundException ako restoran ne postoji', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.setActive('ne-postoji', false, actor)).rejects.toThrow(NotFoundException);
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
      expect(prisma.platformAuditLog.create).not.toHaveBeenCalled();
    });

    it('suspenduje (isActive: false) postojeci restoran i bilježi audit log zapis', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', name: 'Konoba A' });
      prisma.restaurant.update.mockResolvedValue({ id: 'r1', isActive: false });

      const result = await service.setActive('r1', false, actor);

      expect(prisma.restaurant.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isActive: false } });
      expect(prisma.platformAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'suspend_restaurant',
          targetRestaurantId: 'r1',
          targetRestaurantName: 'Konoba A',
        },
      });
      expect(result.isActive).toBe(false);
    });

    it('reaktivacija bilježi "activate_restaurant" akciju', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', name: 'Konoba A' });
      prisma.restaurant.update.mockResolvedValue({ id: 'r1', isActive: true });

      await service.setActive('r1', true, actor);

      expect(prisma.platformAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'activate_restaurant' }) }),
      );
    });
  });

  describe('listAuditLog', () => {
    it('mapira zapise u ravan oblik, najnoviji prvi', async () => {
      prisma.platformAuditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actorEmail: actor.email,
          action: 'suspend_restaurant',
          targetRestaurantId: 'r1',
          targetRestaurantName: 'Konoba A',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listAuditLog();

      expect(result[0]).toEqual({
        id: 'log-1',
        actor_email: actor.email,
        action: 'suspend_restaurant',
        target_restaurant_id: 'r1',
        target_restaurant_name: 'Konoba A',
        created_at: new Date('2026-01-01'),
      });
    });
  });

  describe('platformStats', () => {
    it('vraca sve brojace iz paralelnih upita', async () => {
      prisma.restaurant.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4) // active
        .mockResolvedValueOnce(3) // trialing
        .mockResolvedValueOnce(2) // past_due
        .mockResolvedValueOnce(1); // cancelled
      prisma.order.count.mockResolvedValueOnce(500).mockResolvedValueOnce(20);

      const result = await service.platformStats();

      expect(result).toEqual({
        restaurant_count: 10,
        active_subscriptions: 4,
        trialing_count: 3,
        past_due_count: 2,
        cancelled_count: 1,
        total_orders: 500,
        orders_last_24h: 20,
      });
    });
  });
});
