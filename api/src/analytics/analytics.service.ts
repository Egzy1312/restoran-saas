import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function localizedName(json: unknown): string {
  const rec = json as Record<string, string> | null | undefined;
  if (!rec) return 'Obrisan artikal';
  return rec.bs ?? rec.en ?? Object.values(rec).find(Boolean) ?? 'Artikal';
}

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Osnovna analitika (specifikacija, modul E.3). Racuna se u aplikacionom
 * sloju (ne raw SQL agregacijama) jer je za MVP obim jednog restorana
 * volumen podataka mali - jednostavnije za citanje i odrzavanje, a
 * dovoljno brzo. Ako promet naraste, prve kandidatkinje za raw SQL/
 * materialized view su topItems i tableRevenue.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(restaurantId: string, days: number) {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: since(days) }, status: { not: 'cancelled' } },
      select: { totalAmount: true },
    });
    const revenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    return {
      order_count: orders.length,
      total_revenue: Math.round(revenue * 100) / 100,
      avg_order_value: orders.length ? Math.round((revenue / orders.length) * 100) / 100 : 0,
    };
  }

  async topItems(restaurantId: string, days: number, limit: number) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { restaurantId, createdAt: { gte: since(days) }, status: { not: 'cancelled' } },
      },
      include: { menuItem: true },
    });

    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of items) {
      const key = item.menuItemId ?? item.id;
      const entry = map.get(key) ?? { name: localizedName(item.menuItem?.nameJson), quantity: 0, revenue: 0 };
      entry.quantity += item.quantity;
      entry.revenue += item.quantity * Number(item.unitPrice);
      map.set(key, entry);
    }

    return Array.from(map.entries())
      .map(([menu_item_id, v]) => ({
        menu_item_id,
        name: v.name,
        quantity: v.quantity,
        revenue: Math.round(v.revenue * 100) / 100,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  async avgPrepTime(restaurantId: string, days: number) {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: since(days) }, status: { in: ['ready', 'served'] } },
      select: { createdAt: true, updatedAt: true },
    });

    if (orders.length === 0) return { avg_minutes: 0, sample_size: 0 };

    const totalMinutes = orders.reduce(
      (sum, o) => sum + (o.updatedAt.getTime() - o.createdAt.getTime()) / 60000,
      0,
    );
    return {
      avg_minutes: Math.round((totalMinutes / orders.length) * 10) / 10,
      sample_size: orders.length,
    };
  }

  /** Najprofitabilniji stolovi (specifikacija, modul E.3). */
  async tableRevenue(restaurantId: string, days: number, limit: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: since(days) },
        status: { not: 'cancelled' },
        tableId: { not: null },
      },
      include: { table: true },
    });

    const map = new Map<string, { table_number: string; zone_name: string; revenue: number; order_count: number }>();
    for (const order of orders) {
      if (!order.tableId) continue;
      const entry = map.get(order.tableId) ?? {
        table_number: order.table?.tableNumber ?? '?',
        zone_name: order.table?.zoneName ?? '',
        revenue: 0,
        order_count: 0,
      };
      entry.revenue += Number(order.totalAmount);
      entry.order_count += 1;
      map.set(order.tableId, entry);
    }

    return Array.from(map.entries())
      .map(([table_id, v]) => ({ table_id, ...v, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /** Objedinjeni izvještaj za PDF/Excel izvoz - jedan dokument umjesto odvojenih tabela. */
  async getFullReport(restaurantId: string, days: number) {
    const [restaurant, summary, topItems, avgPrepTime, tableRevenue] = await Promise.all([
      this.prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      this.summary(restaurantId, days),
      this.topItems(restaurantId, days, 10),
      this.avgPrepTime(restaurantId, days),
      this.tableRevenue(restaurantId, days, 10),
    ]);

    return {
      restaurantName: restaurant?.name ?? 'Restoran',
      currency: restaurant?.currency ?? 'BAM',
      days,
      generatedAt: new Date(),
      summary,
      topItems,
      avgPrepTime,
      tableRevenue,
    };
  }
}
