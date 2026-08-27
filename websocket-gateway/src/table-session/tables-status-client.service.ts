import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Klijent prema ../api za guest-inicirane promjene statusa stola (gost nema
 * JWT nalog, zato ide preko interne rute sa dijeljenim tajnim headerom -
 * isti obrazac kao OrdersApiClient). Za sada jedini slucaj je "Zatraži
 * račun" -> status 'bill_requested', da bi se konobarski tlocrt azurirao i
 * bez da je konobar bio online u tom trenutku.
 */
@Injectable()
export class TablesStatusClient {
  private readonly logger = new Logger(TablesStatusClient.name);
  private readonly apiBaseUrl: string;
  private readonly internalSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiBaseUrl = this.config.get<string>('API_BASE_URL', 'http://localhost:3000/api');
    this.internalSecret = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');
  }

  async setStatus(tableId: string, status: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/tables/internal/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.internalSecret,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        this.logger.warn(`Neuspjela promjena statusa stola ${tableId} -> ${status} (${res.status})`);
      }
      return res.ok;
    } catch (err) {
      this.logger.error(`Greška pri promjeni statusa stola ${tableId}: ${(err as Error).message}`);
      return false;
    }
  }
}
