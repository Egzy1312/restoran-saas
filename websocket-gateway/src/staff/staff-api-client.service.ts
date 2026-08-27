import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Klijent prema glavnom API servisu za mutacije koje pokrece osoblje (KDS,
 * konobarski modul). Za razliku od OrdersApiClient (interna ruta sa
 * dijeljenim tajnim headerom), ovdje se prosljedjuje STVARNI JWT osoblja -
 * API i dalje sam provjerava ulogu (npr. samo KITCHEN/BAR/ADMIN smiju
 * mijenjati dostupnost artikla), gateway ne duplira tu logiku.
 */
@Injectable()
export class StaffApiClient {
  private readonly logger = new Logger(StaffApiClient.name);
  private readonly apiBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiBaseUrl = this.config.get<string>('API_BASE_URL', 'http://localhost:3000/api');
  }

  async updateOrderStatus(
    token: string,
    orderId: string,
    status: string,
  ): Promise<
    ApiResult<{
      id: string;
      status: string;
      tableId: string | null;
      orderType: 'dine_in' | 'takeaway';
      orderNumber: number;
      customerName: string | null;
    }>
  > {
    return this.patch(token, `/orders/${orderId}/status`, { status });
  }

  async updateItemAvailability(token: string, menuItemId: string, isAvailable: boolean): Promise<ApiResult<{ id: string; isAvailable: boolean }>> {
    return this.patch(token, `/menu/items/${menuItemId}`, { is_available: isAvailable });
  }

  /** Konobar zatvara sto (naplaćeno/pospremljeno) - vraća status na 'free'. */
  async updateTableStatus(token: string, tableId: string, status: string): Promise<ApiResult<{ id: string; status: string }>> {
    return this.patch(token, `/tables/${tableId}`, { status });
  }

  /** Rucni unos narudzbe od strane konobara (modul C.2) - koristi istu API rutu kao gost narudzba, samo sa staff JWT-om. */
  async createOrder(
    token: string,
    payload: { table_id: string; items: unknown[]; notes?: string },
  ): Promise<ApiResult<{ id: string; orderNumber: number }>> {
    return this.post(token, '/orders', { ...payload, order_type: 'dine_in' });
  }

  /** Odobrava QR narudzbu koja ceka (modul C.3) - tek sad ide u kuhinju/stampu. */
  async approveOrder(token: string, orderId: string): Promise<ApiResult<{ id: string; status: string }>> {
    return this.patch(token, `/orders/${orderId}/approve`, {});
  }

  /** Odbija QR narudzbu koja ceka (modul C.3). */
  async rejectOrder(token: string, orderId: string): Promise<ApiResult<{ id: string; status: string }>> {
    return this.patch(token, `/orders/${orderId}/reject`, {});
  }

  private async patch<T>(token: string, path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>(token, 'PATCH', path, body);
  }

  private async post<T>(token: string, path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>(token, 'POST', path, body);
  }

  private async request<T>(token: string, method: string, path: string, body: unknown): Promise<ApiResult<T>> {
    try {
      const res = await fetch(`${this.apiBaseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`API ${method} ${path} odbijen (${res.status}): ${text}`);
        return { ok: false, error: `API greška (${res.status})` };
      }

      return { ok: true, data: (await res.json()) as T };
    } catch (err) {
      this.logger.error(`Neuspjela komunikacija sa API-jem (${path}): ${(err as Error).message}`);
      return { ok: false, error: 'API trenutno nedostupan.' };
    }
  }
}
