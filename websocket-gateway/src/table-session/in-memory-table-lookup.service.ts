import { Injectable } from '@nestjs/common';
import { TableInfo, TableLookupPort } from './table-lookup.port';

/**
 * Referentna/stub implementacija TableLookupPort-a za lokalni razvoj i
 * integracione testove ovog modula bez potrebe za pravom Postgres bazom.
 *
 * U produkciji zamijeniti provider u TableSessionModule stvarnim
 * repository-jem koji izvrsava:
 *   SELECT id, restaurant_id, table_number, zone_name, qr_code_token
 *   FROM restaurant_tables
 *   WHERE id = $1 AND qr_code_token = $2 AND status != 'inactive'
 */
@Injectable()
export class InMemoryTableLookupService implements TableLookupPort {
  private readonly tables = new Map<string, TableInfo>();

  seed(table: TableInfo) {
    this.tables.set(table.table_id, table);
  }

  async verifyTableToken(tableId: string, qrToken: string): Promise<TableInfo | null> {
    const table = this.tables.get(tableId);
    if (!table || table.qr_code_token !== qrToken) return null;
    return table;
  }
}
