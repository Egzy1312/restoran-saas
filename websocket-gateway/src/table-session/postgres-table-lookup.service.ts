import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { TableInfo, TableLookupPort } from './table-lookup.port';

/**
 * Produkcijska implementacija TableLookupPort-a - cita direktno iz iste
 * Postgres baze koju koristi glavni API servis (`../api`, tabela
 * `restaurant_tables`). Koristi obican `pg` klijent (bez Prisma-e) da ovaj
 * servis ostane lagan i nezavisan od API-jevog build toolchain-a.
 *
 * Namjerno samo SELECT - ovaj servis ne pise u tabelu stolova (status stola
 * azurira konobarski modul preko API-ja).
 */
@Injectable()
export class PostgresTableLookupService implements TableLookupPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresTableLookupService.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_URL'),
      max: 5,
    });
  }

  async verifyTableToken(tableId: string, qrToken: string): Promise<TableInfo | null> {
    try {
      const result = await this.pool.query(
        `SELECT t.id, t.restaurant_id, t.table_number, t.zone_name, t.qr_code_token,
                r.latitude AS restaurant_latitude, r.longitude AS restaurant_longitude,
                r.geofence_radius_meters, r.allowed_ip
         FROM restaurant_tables t
         JOIN restaurants r ON r.id = t.restaurant_id
         -- r.is_active = false znaci suspendovan restoran (platform-admin ili
         -- neplacena pretplata) - gost sa vec ucitanim/keširanim QR linkom
         -- ne smije moci otvoriti sesiju stola cak i ako REST /tables/resolve
         -- vec blokira (isto ponasanje, provjereno i ovdje jer ovaj gateway
         -- ima svoj nezavisan put do baze, ne ide preko tog REST poziva).
         WHERE t.id = $1 AND t.qr_code_token = $2 AND r.is_active = true`,
        [tableId, qrToken],
      );

      if (result.rowCount === 0) return null;

      const row = result.rows[0];
      return {
        table_id: row.id,
        restaurant_id: row.restaurant_id,
        table_number: row.table_number,
        zone_name: row.zone_name,
        qr_code_token: row.qr_code_token,
        restaurant_latitude: row.restaurant_latitude !== null ? Number(row.restaurant_latitude) : null,
        restaurant_longitude: row.restaurant_longitude !== null ? Number(row.restaurant_longitude) : null,
        geofence_radius_meters: row.geofence_radius_meters,
        allowed_ip: row.allowed_ip,
      };
    } catch (err) {
      this.logger.error(`Greška pri verifikaciji stola ${tableId}: ${(err as Error).message}`);
      return null;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
