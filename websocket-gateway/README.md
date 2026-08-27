# WebSocket Gateway — Table Session Module

NestJS modul koji upravlja sobnim sesijama stolova i zajedničkom (multi-user)
korpom u realnom vremenu, u skladu sa sekcijom 5 specifikacije (Real-Time
Arhitektura i WebSocket eventi).

## Instalacija
```bash
npm install
cp .env.example .env
npm run start:dev
```
Zahtijeva pokrenut Redis (`REDIS_HOST`/`REDIS_PORT`).

## Struktura
- `src/table-session/table-session.gateway.ts` — WebSocket handleri (`@SubscribeMessage`)
  za sve gost-dogadjaje: `join_table_session`, `add_cart_item`, `update_cart_item`,
  `remove_cart_item`, `call_waiter`, `place_order`. Emituje `cart_updated`,
  `new_order_received`, `order_placed`.
- `src/table-session/table-session.service.ts` — čita/piše stanje korpe u Redis
  **HASH-u** (`cart_items:{table_id}`, polje = `cart_item_id`), tako da stanje
  preživi restart procesa i radi kad ima više instanci servera. Namjerno
  hash-po-stavci umjesto jednog JSON bloba — dodavanje stavke je `HSET` na
  njeno vlastito polje, atomski, bez read-modify-write. Prvobitna verzija
  (jedan JSON blob po stolu) je end-to-end testom sa dva prava WebSocket
  klijenta koja su istovremeno dodavala stavke otkrivena kao **race
  condition**: kad dva gosta za istim stolom dodaju u istom trenutku, "zadnji
  upis pobjeđuje" tiho brisao stavku onog koji je upisao prvi — otkriveno i
  ispravljeno stvarnim pokretanjem, ne bi bilo vidljivo iz koda ni iz
  sekvencijalnih (ne-konkurentnih) testova.
- `src/table-session/table-lookup.port.ts` — apstrakcija prema stvarnoj bazi
  (`restaurant_tables` tabela) za verifikaciju QR tokena; u ovom repou postoji
  samo referentni in-memory stub (`in-memory-table-lookup.service.ts`) — u
  produkciji zamijeniti Postgres-backed providerom.
- `src/redis/redis.module.ts` + `src/adapters/redis-io.adapter.ts` — dijeljeni
  Redis klijent i Socket.io Redis adapter (horizontalno skaliranje: broadcast
  radi i kad su gosti povezani na različite instance servera iza load balancera).

## Tok: gost skenira QR kod
1. Klijent (PWA) se poveže na Socket.io i emituje `join_table_session`
   `{ table_id, qr_token, guest_id }`.
2. Server verifikuje token protiv `restaurant_tables`, ubacuje socket u sobu
   `table:{table_id}`, vraća `join_table_session_ack` i trenutno stanje korpe
   kroz `cart_updated`.
3. Bilo koji gost za stolom emituje `add_cart_item` / `update_cart_item` /
   `remove_cart_item` — server ažurira korpu u Redisu i broadcast-uje
   `cart_updated` svim uređajima u sobi `table:{table_id}` (drugi gosti to
   vide odmah, bez refresh-a).
4. `place_order` pretvara korpu u narudžbu, šalje `new_order_received` u sobu
   osoblja (`restaurant:{restaurant_id}:staff` — sluša je KDS/konobarski
   modul) i prazni korpu stola. Gost ostaje u sobi `table:{table_id}` pa
   uživo prima `order_status_changed` kad kuhar promijeni status.
5. `track_order { order_id }` — koristi gost BEZ stola (Takeaway/Pickup,
   modul D.3, `POST /api/orders/takeaway/:slug`) da uđe u sobu
   `order:{order_id}` i uživo prati status te jedne narudžbe.
6. `call_waiter` (poziv konobara ili zahtjev za račun) ide direktno u sobu
   osoblja radi trenutne notifikacije.

## Integracija sa ../api (već ožičeno)
- `postgres-table-lookup.service.ts` čita `restaurant_tables` direktno iz iste
  Postgres baze koju koristi `../api` (obični `pg` klijent, bez Prisma-e) —
  ovo je podrazumijevana implementacija `TABLE_LOOKUP_PORT`-a. Za lokalni rad
  bez baze, u `table-session.module.ts` zamijeniti sa
  `InMemoryTableLookupService`.
- `orders-api-client.service.ts` zove `POST {API_BASE_URL}/orders/internal`
  (sa `X-Internal-Secret` headerom) kad gost pošalje `place_order`. Perzistencija
  narudžbe, rekalkulacija cijena i pokretanje `print_job_dispatch` toka
  (Smart Routing kuhinja/šank) dešavaju se u `../api` — ovaj gateway čeka
  odgovor prije nego što isprazni korpu, da narudžba ne "nestane" ako API
  trenutno nije dostupan (gost tad dobija `place_order_error` i korpa ostaje netaknuta).
## Staff sloj (KDS/konobar) — `src/staff/`
Odvojen od gost-sesija ali dijeli isti Socket.io server (iste sobe
`restaurant:{id}:staff`/`:menu` u koje `table-session.gateway.ts` već emituje
`new_order_received`/`call_waiter`):
- `join_staff_session { token }` — KDS/konobarski klijent šalje JWT dobijen od
  `api/POST /auth/login`; verifikacija je lokalna (isti `JWT_SECRET` kao api, vidi `.env.example`).
- `update_order_status { order_id, status }` — poziva `api/PATCH /orders/:id/status`
  sa staff-ovim JWT-om, pa broadcast-uje `order_status_changed` svim ekranima osoblja
  **i gostu koji je naručio** — dine-in gostu u sobu `table:{table_id}` (već je
  u njoj od `join_table_session`), a takeaway gostu u sobu `order:{order_id}`
  (vidi `track_order` ispod). Prije ovoga je gost saznavao da je jelo gotovo
  jedino kad mu konobar fizički donese hranu — sad se `order_status_changed`
  emituje i njemu, testirano end-to-end (dine-in i takeaway odvojeno).
- `toggle_item_availability { menu_item_id, is_available }` — "86-ing"; poziva
  `api/PATCH /menu/items/:id`, pa broadcast-uje `menu_item_availability_changed`
  osoblju **i** gostima trenutno na meniju (soba `restaurant:{id}:menu`, gost se
  pridružuje pri `join_table_session`).

## Geofencing / Wi-Fi anti-fraud (dodano u kasnijem prolazu)

`join_table_session` sad, ako restoran ima podešen `geofenceRadiusMeters`
i/ili `allowedIp` (`admin/app/settings`), odbija sesiju kad:
- gost nije poslao GPS koordinate a radijus je podešen,
- Haversine udaljenost od koordinata restorana prelazi radijus
  (`table-session/geo.util.ts`),
- `allowedIp` je podešen i ne poklapa se sa `client.handshake.address`
  (normalizovano za IPv4-mapped-IPv6 `::ffff:` prefiks).

Testirano 4/4 scenarija (unutar radijusa, van radijusa, nedostaju
koordinate, pogrešan IP) protiv žive baze.

`onPlaceOrder` takođe grana na `order_pending_approval` umjesto
`new_order_received` kad restoran ima `requireOrderApproval` uključeno —
konobar tad mora `approve_order`/`reject_order` prije nego narudžba ide u
kuhinju/štampu (vidi `staff.gateway.ts`).

## Docker
```bash
docker build -t restoran-ws .
```
Vidi root [`docker-compose.yml`](../docker-compose.yml).
