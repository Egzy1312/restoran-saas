/**
 * Port (interfejs) prema stvarnom izvoru istine za stolove - u glavnoj API
 * aplikaciji ovo implementira repository koji cita `restaurant_tables` tabelu
 * (vidi DDL semu u specifikaciji). Ovaj WebSocket gateway modul namjerno ne
 * zna nista o Postgres-u/ORM-u - samo zavisi od ove apstrakcije, sto ga cini
 * lako testirajucim i odvojivim ako se u buducnosti WS sloj izdvoji u
 * poseban mikroservis.
 *
 * `TABLE_LOOKUP_PORT` je DI token; konkretna implementacija se vezuje u
 * TableSessionModule (za sada `InMemoryTableLookupService` kao referentni
 * primjer/stub za lokalni razvoj i testove).
 */
export const TABLE_LOOKUP_PORT = 'TABLE_LOOKUP_PORT';

export interface TableInfo {
  table_id: string;
  restaurant_id: string;
  table_number: string;
  zone_name: string;
  qr_code_token: string;
  // Anti-fraud (modul A.6) - null/undefined znaci restoran nije podesio tu provjeru, preskace se.
  restaurant_latitude: number | null;
  restaurant_longitude: number | null;
  geofence_radius_meters: number | null;
  allowed_ip: string | null;
}

export interface TableLookupPort {
  /** Vraca podatke o stolu ako `table_id` + `qr_token` par odgovara aktivnom stolu, inace null. */
  verifyTableToken(tableId: string, qrToken: string): Promise<TableInfo | null>;
}
