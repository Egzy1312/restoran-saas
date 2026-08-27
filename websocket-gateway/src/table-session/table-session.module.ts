import { Module } from '@nestjs/common';
import { TableSessionGateway } from './table-session.gateway';
import { TableSessionService } from './table-session.service';
import { TABLE_LOOKUP_PORT } from './table-lookup.port';
import { PostgresTableLookupService } from './postgres-table-lookup.service';
import { OrdersApiClient } from './orders-api-client.service';
import { TablesStatusClient } from './tables-status-client.service';

@Module({
  providers: [
    TableSessionGateway,
    TableSessionService,
    OrdersApiClient,
    TablesStatusClient,
    // Cita restaurant_tables direktno iz iste Postgres baze koju koristi
    // ../api. Za lokalne testove bez baze, zamijeniti sa
    // InMemoryTableLookupService (vidi in-memory-table-lookup.service.ts).
    { provide: TABLE_LOOKUP_PORT, useClass: PostgresTableLookupService },
  ],
  exports: [TableSessionService],
})
export class TableSessionModule {}
