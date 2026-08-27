import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Platform-level (SUPER_ADMIN) uvid/upravljanje SVIM tenantima (restoranima).
 * Namjerno odvojeno od restaurants.service.ts (koji je uvijek skopiran na
 * JEDAN restoran preko RolesGuard-a) - ove rute vidi samo platforma, ne
 * restoranovo osoblje.
 */
@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listRestaurants() {
    const restaurants = await this.prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true, staffUsers: true, tables: true } } },
    });

    return restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      is_active: r.isActive,
      subscription_status: r.subscriptionStatus,
      trial_ends_at: r.trialEndsAt,
      subscription_renews_at: r.subscriptionRenewsAt,
      created_at: r.createdAt,
      order_count: r._count.orders,
      staff_count: r._count.staffUsers,
      table_count: r._count.tables,
    }));
  }

  async platformStats() {
    const [restaurantCount, activeSubscriptions, trialingCount, pastDueCount, cancelledCount, totalOrders, orders24h] =
      await Promise.all([
        this.prisma.restaurant.count(),
        this.prisma.restaurant.count({ where: { subscriptionStatus: 'active' } }),
        this.prisma.restaurant.count({ where: { subscriptionStatus: 'trialing' } }),
        this.prisma.restaurant.count({ where: { subscriptionStatus: 'past_due' } }),
        this.prisma.restaurant.count({ where: { subscriptionStatus: 'cancelled' } }),
        this.prisma.order.count(),
        this.prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - DAY_MS) } } }),
      ]);

    return {
      restaurant_count: restaurantCount,
      active_subscriptions: activeSubscriptions,
      trialing_count: trialingCount,
      past_due_count: pastDueCount,
      cancelled_count: cancelledCount,
      total_orders: totalOrders,
      orders_last_24h: orders24h,
    };
  }

  /** Suspenduje/reaktivira tenant - `is_active: false` vec blokira gost meni/QR (menu.service.ts, tables.service.ts) i join_table_session (websocket-gateway). Bilježi se u PlatformAuditLog (vidi listAuditLog). */
  async setActive(restaurantId: string, isActive: boolean, actor: { id: string; email: string }) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    const updated = await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { isActive } });

    await this.prisma.platformAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        action: isActive ? 'activate_restaurant' : 'suspend_restaurant',
        targetRestaurantId: restaurant.id,
        targetRestaurantName: restaurant.name,
      },
    });

    return updated;
  }

  async listAuditLog(limit = 100) {
    const entries = await this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return entries.map((e) => ({
      id: e.id,
      actor_email: e.actorEmail,
      action: e.action,
      target_restaurant_id: e.targetRestaurantId,
      target_restaurant_name: e.targetRestaurantName,
      created_at: e.createdAt,
    }));
  }
}
