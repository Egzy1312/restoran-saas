import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartItem } from './interfaces/cart.interface';

interface PlaceOrderResult {
  ok: boolean;
  order_id?: string;
  order_number?: number;
  /** 'pending_approval' ako restoran ima ukljucen requireOrderApproval (modul C.3) - jos nije poslano u kuhinju. */
  status?: string;
  error?: string;
}

/**
 * Klijent prema glavnom API servisu (`../api`) - poziva se kad gost posalje
 * `place_order`. Ovaj gateway namjerno ne pise direktno u Postgres za
 * narudzbe (za razliku od PostgresTableLookupService koji samo cita stolove)
 * jer API sadrzi poslovnu logiku (rekalkulacija cijena, Smart Routing print
 * dispatch) koju ne zelimo duplirati u dva servisa.
 */
@Injectable()
export class OrdersApiClient {
  private readonly logger = new Logger(OrdersApiClient.name);
  private readonly apiBaseUrl: string;
  private readonly internalSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiBaseUrl = this.config.get<string>('API_BASE_URL', 'http://localhost:3000/api');
    this.internalSecret = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');
  }

  async placeOrder(params: {
    restaurantId: string;
    tableId: string;
    items: CartItem[];
    notes?: string;
    placedBy: string;
  }): Promise<PlaceOrderResult> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/orders/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.internalSecret,
        },
        body: JSON.stringify({
          restaurant_id: params.restaurantId,
          table_id: params.tableId,
          order_type: 'dine_in',
          notes: params.notes,
          placed_by: params.placedBy,
          items: params.items.map((item) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            item_notes: item.item_notes,
            added_by: item.added_by, // za "split by item" (racun/modul A.5)
            selected_modifiers: item.selected_modifiers.map((m) => ({ id: m.id })),
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`API je odbio narudžbu (${response.status}): ${body}`);
        return { ok: false, error: `API greška (${response.status})` };
      }

      // Napomena: API vraca sirovi Prisma objekat (camelCase polja), za
      // razliku od ostatka ovog gateway-a koji koristi snake_case payload-e.
      const order = (await response.json()) as { id: string; orderNumber: number; status: string };
      return { ok: true, order_id: order.id, order_number: order.orderNumber, status: order.status };
    } catch (err) {
      this.logger.error(`Neuspjela komunikacija sa API-jem: ${(err as Error).message}`);
      return { ok: false, error: 'API trenutno nedostupan.' };
    }
  }
}
