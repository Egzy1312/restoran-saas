# Konobar — Tlocrt i naplata

Next.js aplikacija za konobare (modul C u specifikaciji): pregled svih
stolova po zonama sa statusom u realnom vremenu, poziv konobara/zahtjev za
račun, ručni unos narudžbe, zatvaranje stola.

## Instalacija
```bash
npm install
cp .env.local.example .env.local
npm run dev
```
Prijava: isti `staff_users` nalog kao KDS (role `WAITER`/`ADMIN`/`MANAGER`).

## Tlocrt (Floor Plan Overview)
Stolovi su grupisani po `zone_name` (Bašta/Sala/VIP...) u responsive grid —
**ne** slobodno pozicioniranje po `pos_x`/`pos_y` (to je Visual Floor Plan
Editor iz admin panela, koji još ne postoji — vidi root README). Boja
pločice je izvedena kombinacijom perzistiranog `restaurant_tables.status` i
trenutnih aktivnih narudžbi tog stola:

| Status | Kako se određuje |
|---|---|
| Slobodan (sivo) | `table.status === 'free'` |
| Rezervisan (ljubičasto) | `table.status === 'reserved'` |
| Čeka hranu (narandžasto) | `occupied` + postoji narudžba `pending`/`preparing` |
| Poslužen (zeleno) | `occupied` + nema aktivnih (nepripremljenih) narudžbi |
| Traži račun (plavo) | `table.status === 'bill_requested'` (postavlja WS gateway na `call_waiter{type:'bill'}`) |
| Poziva konobara (treperi crveno) | transient overlay iz `call_waiter{type:'call'}`, nestaje otvaranjem stola ili nakon 3 min |

## Akcije (sve preko WebSocket Gateway-a, `../websocket-gateway`)
- `join_staff_session` — isti staff kanal kao KDS.
- Klik na sto → `TableDetail` modal: pregled aktivnih narudžbi, **+ Nova
  narudžba** (`place_manual_order` — modul C.2, ručni unos bez QR koda) i
  **Zatvori sto** (`close_table` — vraća status na `free` i briše eventualnu
  zaostalu Redis korpu da sljedeći gost ne naslijedi tuđu korpu).
- Sve promjene (`table_status_changed`, `new_order_received`,
  `order_status_changed`) stižu uživo — više konobarskih ekrana ostaje sinhronizovano.

## Šta nedostaje
- Odobravanje narudžbi prije slanja u kuhinju (opcioni mod iz modula C.3).
- Slobodno pozicioniranje stolova na tlocrtu (čeka Visual Floor Plan Editor).
- Split-the-bill prikaz pri naplati (trenutno "Zatvori sto" samo označava naplaćeno, bez UI za podjelu).
