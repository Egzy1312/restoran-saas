# Gost PWA — Digitalni meni

Next.js (App Router) PWA koju gost otvara skeniranjem QR koda sa stola —
bez instalacije, bez registracije (modul A u specifikaciji).

## Instalacija
```bash
npm install
cp .env.local.example .env.local   # podesiti NEXT_PUBLIC_API_BASE_URL i NEXT_PUBLIC_WS_URL
npm run dev
```
Zahtijeva pokrenut `../api` i `../websocket-gateway` (i njihove zavisnosti — Postgres, Redis).

## Ruta
`/r/{restaurant_slug}/t/{token}` — `{token}` je opaki `qr_code_token` iz
`restaurant_tables` (ne sirovi UUID), tačno kao što je odštampan u QR kodu.
Stranica prvo razrješava token preko `GET /api/tables/resolve/:token` u
stvarni `table_id`, zatim učitava javni meni i otvara WebSocket sesiju.

## Tok
1. `menu-client.tsx` razrješava token → učita `GET /api/menu/public/:slug`.
2. Poveže se na `websocket-gateway` i emituje `join_table_session`.
3. Svaki `add_cart_item` / `update_cart_item` odmah stiže nazad kroz
   `cart_updated` — ako je za istim stolom otvoren i drugi telefon (drugi
   gost), oba uređaja vide identičnu korpu u realnom vremenu.
4. „Pošalji narudžbu" emituje `place_order`; nakon toga gost ostaje u
   `table:{table_id}` sobi pa **uživo vidi kad kuhar promijeni status**
   narudžbe (`order_status_changed` → "U pripremi" / "🍽️ Spremna!" /
   "Poslužena") — bez ovoga bi jedini način da sazna bio kad mu konobar
   fizički donese hranu. „Pozovi konobara" / „Zatraži
   račun" emituju `call_waiter`. „Zatraži račun" dodatno otvara
   `bill-modal.tsx` — **Split the Bill** (modul A.5): `GET
   /api/orders/bill/:tableId?qr_token=...` vraća sve narudžbe za sto od
   početka dana, sa opcijom "Jednaki dijelovi" (ukupno / broj osoba) i "Po
   stavkama" (grupisano po `added_by` — istom guest_id-u koji je snimljen dok
   je stavka bila u zajedničkoj korpi, pa se prenosi kroz cijelu narudžbu).

## Ostale rute
- `/book/{slug}` — Interactive Floor Plan Booking (modul D.1): gost bira
  datum/vrijeme/broj gostiju, vidi listu slobodnih stolova (`GET
  /api/reservations/public/:slug/availability`) i potvrđuje rezervaciju.
  Standalone flow, ne zahtijeva QR/sto.
- `/menu-preview/{slug}` — read-only prikaz menija (bez korpe/naručivanja),
  koristi ga `widget.js` za `data-type="menu"`.
- `/takeaway/{slug}` — Takeaway/Pickup (modul D.3): standalone naručivanje od
  kuće (bez QR/stola) — bira artikle, vrijeme preuzimanja, unosi kontakt,
  bira gotovina/kartica **pri preuzimanju** (stvarna online plaćanja preko
  platnog servisa nisu implementirana — namjerno van obima).
  **Najranije vrijeme preuzimanja je dinamičko**, ne fiksnih +30 min: `GET
  /api/orders/takeaway/:slug/earliest-pickup` raste sa brojem trenutno
  aktivnih narudžbi u kuhinji (15 min baza + 4 min po aktivnoj narudžbi,
  max 90 min) — testirano stvarnim opterećenjem (10 aktivnih narudžbi → 55
  min, gost koji pokuša izabrati raniji termin dobija 400 sa tačnim
  najranijim slotom). `POST /api/orders/takeaway/:slug` ponovo provjerava
  ovu granicu pri slanju (ne vjeruje vrijednosti koju je klijent možda
  učitao par minuta ranije), sa 10 min popusta. Ekran potvrde uživo prati
  status narudžbe preko `track_order { order_id }` (gost nema sto/sobu kao
  dine-in, pa se prijavljuje direktno na `order:{order_id}` sobu) — "U
  pripremi" → "✅ Spremno za preuzimanje!", bez potrebe da osvježi stranicu.
- `public/widget.js` — embeddable skripta za ugradnju na sajt restorana (vidi root README), sad podržava i `data-type="takeaway"`.

## Multi-language (modul A.3)
`lib/locale.ts` — `useLocale()` hook automatski detektuje jezik browsera
(`navigator.languages`) pri prvom učitavanju, sa ručnim prekidačem
(`components/language-switcher.tsx`, 🇧🇦🇬🇧🇩🇪🇮🇹) koji pamti izbor u
`localStorage` (preživljava navigaciju između `/r`, `/takeaway`, `/book`).
Hrvatski/srpski dijele isti `bs` prevod u `name_json`-u (nema odvojenih
kolona) — testirano da se oba mapiraju na `bs`; njemački/italijanski se
biraju eksplicitno ali bez prevoda u seed podacima graciozno padaju nazad na
bs → en → bilo koji dostupan jezik (`localize()` funkcija, testirana za sve
kombinacije). **Napomena:** `bill-modal.tsx` (Split the Bill) prikazuje
nazive artikala onako kako ih je API već lokalizovao server-side (bs/en
prioritet, ne prati PWA prekidač) — manje poznato ograničenje.

## Šta nedostaje za punu PRD funkcionalnost (namjerno van ovog prolaza)
- Geofencing / Wi-Fi anti-fraud provjera prije `join_table_session`.
- SMS/WhatsApp potvrda i podsjetnik nakon rezervacije.
- Prave PWA ikone u `public/manifest.json` (`icons: []` — dodati prije produkcije, inače browser neće ponuditi instalaciju).
- Service worker / offline keš menija.
