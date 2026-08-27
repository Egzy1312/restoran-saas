# KDS — Kitchen Display System

Touch-optimizovan ekran za kuhinju/šank (modul B u specifikaciji). Prikazuje
narudžbe u realnom vremenu, boji ih po vremenu čekanja, omogućava promjenu
statusa jednim dodirom i "86-ing" (trenutno obilježavanje artikla rasprodanim).

## Instalacija
```bash
npm install
cp .env.local.example .env.local   # API_BASE_URL, WS_URL, i opciono KDS_STATION
npm run dev
```
Prijava koristi isti nalog kao ostatak platforme (`api` → `staff_users`,
role `KITCHEN`/`BAR`/`ADMIN`/`MANAGER`). Nakon `npm run seed` u `api`, koristi
`admin@konoba-adriatic.test` / `admin123` (ADMIN ima pristup po defaultu).

## Kako radi
- `/login` — `POST /api/auth/login`, JWT se čuva u `localStorage`.
- `/board` — nakon učitavanja postojećih narudžbi (`GET /api/orders?status=...`),
  poveže se na `websocket-gateway` i emituje `join_staff_session { token }`.
- `new_order_received` (push od gost narudžbe) → dovlači punu narudžbu preko
  `GET /api/orders/:id` i dodaje karticu; **zvučni alarm** (Web Audio API, bez
  eksternog fajla) ponavlja se na 8s dok se narudžba ne "potvrdi" (klik na
  „Počni pripremu").
- Kartice se boje po `createdAt`: zeleno < 5 min, žuto 5–15 min, crveno > 15 min
  (crveno dodatno pulsira).
- Dodir na dugme statusa emituje `update_order_status` — server upisuje u
  bazu i broadcast-uje `order_status_changed` svim ekranima (više KDS-ova
  ostaje sinhronizovano). „Poslužen" uklanja karticu sa табле.
- Panel „Artikli" (gornji desni ugao) — puna lista menija, dodir na artikal
  emituje `toggle_item_availability` (86-ing); promjena se odmah vidi i na
  gost PWA meniju (`../pwa`).

## Filtriranje po stanici
`NEXT_PUBLIC_KDS_STATION=kitchen` (ili `bar`) prikazuje samo stavke tog
`print_target`-a unutar svake narudžbe (isti princip kao Smart Routing za
štampu) — korisno kad kuhinja i šank imaju odvojene ekrane. Prazno = prikazuje sve.

## Šta nedostaje za punu funkcionalnost
- Odobravanje narudžbi prije slanja u kuhinju (opcioni "approve" mod iz
  modula C.3) — trenutno svaka `place_order` odmah stiže na KDS.
- Kartica ne prikazuje ko je (koji gost) šta naručio (dostupno u payload-u
  `new_order_received`, ali `GET /orders/:id` ga trenutno ne vraća).
