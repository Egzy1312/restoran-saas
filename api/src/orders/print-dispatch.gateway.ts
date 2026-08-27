import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { Order, OrderItem, Restaurant, RestaurantTable } from '@prisma/client';

interface PrintableOrderItem extends OrderItem {
  menuItem: { nameJson: unknown; printTarget: string } | null;
}

/**
 * Namjerno SAMO polja koja su ovdje stvarno potrebna - ne puni `Restaurant`
 * (koji nosi enkriptovane Twilio/Stripe tajne i sl.). OrdersService.create()
 * sad selektuje bas ovaj podskup (vidi SAFE_RESTAURANT_SELECT tamo) umjesto
 * da ucitava/prosljedjuje/vraca klijentu cijeli restoran-objekat.
 */
export type PrintableRestaurant = Pick<
  Restaurant,
  'id' | 'name' | 'kitchenPrinterIp' | 'kitchenPrinterPort' | 'barPrinterIp' | 'barPrinterPort'
>;

/**
 * Server-side pola drugog kraja Print Gateway agenta (vidi print-gateway/src/index.js).
 * Agenti (jedan po restoranu, na lokalnom racunaru kase/Raspberry Pi) se
 * povezuju na namespace '/agents' i pridruzuju sobi `restaurant:{id}:agents`.
 * OrdersService poziva `dispatchOrder()` nakon svakog uspjesno kreiranog
 * naloga - ova klasa vec radi Smart Routing (razdvaja stavke po
 * kitchen/bar printeru) prije slanja.
 */
@Injectable()
@WebSocketGateway({
  path: '/agents',
  cors: { origin: '*' },
})
export class PrintDispatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PrintDispatchGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly config: ConfigService) {}

  handleConnection(client: Socket) {
    const { role, restaurant_id: restaurantId, token } = client.handshake.auth as Record<string, string>;
    const expectedSecret = this.config.get<string>('PRINT_AGENT_SHARED_SECRET');

    if (role !== 'print_agent' || !restaurantId || token !== expectedSecret) {
      this.logger.warn(`Odbijena konekcija print-agenta (nevažeći auth): ${client.id}`);
      client.disconnect(true);
      return;
    }

    client.join(this.agentRoom(restaurantId));
    this.logger.log(`Print-agent povezan za restoran ${restaurantId} (socket ${client.id})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Print-agent otkacen: ${client.id}`);
  }

  @SubscribeMessage('agent_ready')
  onAgentReady(payload: { restaurant_id: string }) {
    this.logger.log(`Print-agent restorana ${payload.restaurant_id} javio da je spreman.`);
  }

  /** Agent javlja ishod stampe - ovdje samo logujemo; u produkciji bi se cuvalo u print_jobs tabeli za KDS indikator "printer offline". */
  @SubscribeMessage('print_job_status')
  onPrintJobStatus(payload: { job_id: string; status: string; error?: string }) {
    if (payload.status === 'printed') {
      this.logger.log(`Posao ${payload.job_id} odštampan.`);
    } else {
      this.logger.warn(`Posao ${payload.job_id} status='${payload.status}': ${payload.error ?? ''}`);
    }
  }

  /**
   * Smart Routing: grupise stavke narudzbe po print_target-u i emituje jedan
   * `print_job_dispatch` po printeru (kuhinja / šank) - agent ne mora znati
   * nista o poslovnoj logici, samo prima vec filtrirane stavke za "svoj" printer.
   */
  dispatchOrder(order: Order, items: PrintableOrderItem[], restaurant: PrintableRestaurant, table: RestaurantTable | null) {
    const groups = new Map<'kitchen' | 'bar', PrintableOrderItem[]>();

    for (const item of items) {
      const target = (item.menuItem?.printTarget as 'kitchen' | 'bar') ?? 'kitchen';
      if (!groups.has(target)) groups.set(target, []);
      groups.get(target)!.push(item);
    }

    for (const [target, targetItems] of groups) {
      const printerIp = target === 'bar' ? restaurant.barPrinterIp : restaurant.kitchenPrinterIp;
      const printerPort = target === 'bar' ? restaurant.barPrinterPort : restaurant.kitchenPrinterPort;

      if (!printerIp) {
        this.logger.warn(
          `Restoran ${restaurant.id} nema podešen ${target} printer - preskačem print_job_dispatch za narudžbu ${order.id}.`,
        );
        continue;
      }

      const payload = {
        job_id: uuid(),
        print_target: target,
        printer_ip: printerIp,
        printer_port: printerPort ?? 9100,
        restaurant_name: restaurant.name,
        table_number: table?.tableNumber ?? '—',
        zone_name: table?.zoneName ?? '',
        order_number: order.orderNumber,
        order_notes: order.notes ?? undefined,
        created_at: order.createdAt.toISOString(),
        items: targetItems.map((i) => ({
          name: this.itemName(i),
          quantity: i.quantity,
          unit_price: Number(i.unitPrice),
          item_notes: i.itemNotes ?? undefined,
          selected_modifiers: i.selectedModifiers ?? [],
        })),
      };

      this.server.to(this.agentRoom(restaurant.id)).emit('print_job_dispatch', payload);
      this.logger.log(`print_job_dispatch (${target}) poslan za narudžbu #${order.orderNumber}, restoran ${restaurant.id}`);
    }
  }

  private agentRoom(restaurantId: string): string {
    return `restaurant:${restaurantId}:agents`;
  }

  private itemName(item: PrintableOrderItem): string {
    const nameJson = item.menuItem?.nameJson as Record<string, string> | undefined;
    return nameJson?.bs ?? nameJson?.en ?? Object.values(nameJson ?? {})[0] ?? 'Artikal';
  }
}
