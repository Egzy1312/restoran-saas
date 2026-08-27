# Restoran SaaS Platforma

Implementacija prema tehničkoj specifikaciji: naručivanje putem QR koda,
zajednička korpa u realnom vremenu, automatska LAN štampa narudžbi, i
osnovni backend za meni/stolove/narudžbe/rezervacije.

## Servisi

| Servis | Uloga | Port (dev) |
|---|---|---|
| [`api/`](api/) | Glavni REST API — Postgres (Prisma), auth osoblja, meni, stolovi, narudžbe, rezervacije, Smart Routing print dispatch (`/agents` WS namespace) | 3000 |
| [`websocket-gateway/`](websocket-gateway/) | Realtime sloj — gost sesije/korpa (Redis) **i** staff kanal (KDS: `join_staff_session`, `update_order_status`, `toggle_item_availability`) | 3001 |
| [`print-gateway/`](print-gateway/) | Lokalni agent (pokreće se *unutar restorana*, ne u cloudu) — prima print naloge, formatira ESC/POS, šalje na LAN printer :9100 | — |
| [`pwa/`](pwa/) | Gost PWA (Next.js) — digitalni meni, QR narudžba | 3002 |
| [`kds/`](kds/) | Kitchen Display System (Next.js) — narudžbe uživo, boje po vremenu čekanja, 86-ing | 3003 |
| [`waiter/`](waiter/) | Konobarski modul (Next.js) — tlocrt stolova po zonama, poziv/račun, ručni unos narudžbe, zatvaranje stola | 3004 |
| [`admin/`](admin/) | Admin panel (Next.js) — menadžer menija, Visual Floor Plan Editor sa QR generisanjem, analitika | 3005 |
| [`docs/MVP_ROADMAP.md`](docs/MVP_ROADMAP.md) | Sprint plan (30 dana) | — |

## Kako se uklapaju (tok jedne narudžbe)

```
Gost skenira QR
   │  GET /api/tables/resolve/:token   (pwa -> api)
   │  GET /api/menu/public/:slug       (pwa -> api)
   ▼
pwa  ──join_table_session──▶  websocket-gateway  (čita restaurant_tables direktno iz Postgres)
   │                               │
   │◀────────cart_updated──────────┤  (Redis: cart:{table_id}, uživo svim uređajima za stolom)
   │                               │
   └──────place_order─────────────▶│
                                    │  POST /api/orders/internal  (X-Internal-Secret)
                                    ▼
                                   api  ── upiše orders/order_items (Prisma) ──▶ Postgres
                                    │
                                    │  print_job_dispatch (po printeru: kuhinja/šank)
                                    ▼
                          print-gateway (u restoranu)
                                    │  TCP :9100, ESC/POS bajtovi
                                    ▼
                          termalni printer (kuhinja / šank)
```

## ✅ Verifikovano stvarnim pokretanjem (ne samo kompajliranjem)

Ovaj stack je **stvarno pokrenut** lokalno (PostgreSQL 17 + Memurai/Redis
instalirani, migracije izvršene, seed pušten) i testiran preko pravog
WebSocket protokola (socket.io-client skripta koja glumi gosta i osoblje) i
pravih HTTP poziva. Rezultat: **16/16 provjera prošlo** (join sesije, sync
korpe uživo, place_order → upis u bazu → occupied status, call_waiter →
bill_requested, promjena statusa narudžbe, zatvaranje stola), plus
analitika/CSV/86-ing preko REST-a, plus **kompletan print tok** (API →
Smart Routing split kuhinja/šank → agent → ESC/POS → TCP → ispravno
dekodirani bosanski dijakritici na "printeru").

Usput pronađene i ispravljene tri prave greške koje `tsc`/`next build`
nisu mogle uhvatiti:
1. `websocket-gateway` nije imao `@nestjs/platform-express` u zavisnostima —
   `NestFactory.create()` uvijek treba HTTP adapter, čak i za WS-fokusiranu app.
2. Portovi 3000 i 3001 su na ovoj mašini bili zauzeti nepovezanim procesima —
   API i WebSocket Gateway sada podrazumijevano rade na **3010**/**3011** u
   ovom repou (vidi `.env` fajlove; `.env.example` i dalje predlaže 3000/3001
   kao generički default za čiste mašine).
3. **Race condition u zajedničkoj korpi** — kad dva gosta za istim stolom
   dodaju stavku u istom trenutku, stara implementacija (jedan JSON blob po
   stolu, read-modify-write) je tiho gubila jednu od izmjena ("zadnji upis
   pobjeđuje"). Otkriveno testom sa dva prava, istovremena WebSocket
   klijenta; ispravljeno prelaskom na Redis HASH (po-stavci atomski `HSET`).
   Vidi `websocket-gateway/README.md`.
4. **Istekao JWT se tiho gutao** u sve tri staff aplikacije (KDS, konobar,
   admin) — REST pozivi su na `401` vraćali prazne liste/`null` umjesto da
   vrate korisnika na prijavu; otkriveno kad je test token stvarno istekao
   (8h TTL) usred sesije. Ispravljeno: svaki REST poziv sad prepoznaje `401`,
   čisti sesiju i preusmjerava na `/login` (`window.location`, ne
   `next/navigation`, jer su `lib/api.ts` obični moduli bez pristupa router-u).
   WS strana (KDS/konobar) se već ranije sama vraćala na login preko
   `join_staff_session_error`, ali samo pri (re)konekciji — **poznato
   preostalo ograničenje**: ako token istekne dok je socket već povezan i
   aktivan, ta konekcija se ne prekida sama od sebe dok se sledeći put ne
   pokuša REST poziv ili rekonekcija (nema periodične re-validacije JWT-a na
   otvorenoj WS sesiji — pravo rješenje bi bio refresh token mehanizam, van
   obima ovog prolaza).

## Pokretanje cijelog stacka lokalno

Preduslovi: Node 18+, PostgreSQL, Redis (na ovoj mašini: Memurai Developer,
Redis-kompatibilan Windows servis).

```bash
# 1) API (baza + auth + narudžbe)
cd api && npm install && cp .env.example .env
npx prisma migrate dev --name init
npm run seed
npm run start:dev            # http://localhost:3000/api (ovdje stvarno radi na :3010, vidi napomenu iznad)

# 2) WebSocket Gateway (nova konzola)
cd websocket-gateway && npm install && cp .env.example .env
# DATABASE_URL i INTERNAL_SERVICE_SECRET moraju odgovarati onima u api/.env
npm run start:dev            # http://localhost:3001 (ovdje stvarno radi na :3011)

# 3) Gost PWA (nova konzola)
cd pwa && npm install && cp .env.local.example .env.local
npm run dev -- -p 3002       # http://localhost:3002

# 4) KDS (nova konzola)
cd kds && npm install && cp .env.local.example .env.local
npm run dev -- -p 3003       # http://localhost:3003 — prijava: admin@konoba-adriatic.test / admin123

# 5) Konobar (nova konzola)
cd waiter && npm install && cp .env.local.example .env.local
npm run dev -- -p 3004       # http://localhost:3004 — ista prijava

# 6) Admin panel (nova konzola)
cd admin && npm install && cp .env.local.example .env.local
npm run dev -- -p 3005       # http://localhost:3005 — ista prijava (ADMIN/MANAGER)

# 7) Print Gateway (opciono - treba pravi ili emulirani LAN printer)
cd print-gateway && npm install && cp .env.example .env
# AGENT_TOKEN mora odgovarati PRINT_AGENT_SHARED_SECRET iz api/.env
npm start
```

**Napomena:** `websocket-gateway/.env` mora imati isti `JWT_SECRET` kao
`api/.env` (KDS/staff JWT verifikacija je lokalna, bez poziva ka API-ju pri
svakoj konekciji) i isti `DATABASE_URL`/`INTERNAL_SERVICE_SECRET`.

## Embeddable widget (modul D.2)
Za ugradnju rezervacije/menija na postojeći sajt restorana:
```html
<div data-restoran-widget data-slug="konoba-adriatic" data-type="reservation"></div>
<script src="http://localhost:3002/widget.js" async></script>
```
`data-type="menu"` prikazuje read-only pregled menija umjesto rezervacije.
Skripta ubacuje iframe direktno u element — gost ostaje na sajtu restorana.
Vidi [`pwa/public/widget.js`](pwa/public/widget.js).

Nakon `npm run seed` u `api`, test QR link je ispisan u konzoli (oblika
`/r/konoba-adriatic/t/{table_id}` — u PWA URL-u koristiti sam
`qr_code_token`, npr. `http://localhost:3002/r/konoba-adriatic/t/seed-token-t1`).

## Status u odnosu na punu specifikaciju

**Urađeno:** modul A (gost meni + zajednička korpa + poziv konobara/račun),
modul B (KDS — narudžbe uživo, boje po vremenu čekanja, promjena statusa,
86-ing, zvučni alarm), modul C (konobarski tlocrt po zonama sa statusima
stola u realnom vremenu, ručni unos narudžbe, zatvaranje stola), modul D
(Interactive Floor Plan Booking — gost bira termin i konkretan sto uz provjeru
sudara termina, `pwa/public/widget.js` embeddable widget za rezervaciju/pregled
menija, pregled i potvrđivanje rezervacija u admin panelu), modul E (admin
panel — menadžer menija, Visual Floor Plan Editor sa drag-and-drop
pozicioniranjem i QR generisanjem, analitika sa CSV izvozom), kompletna print
arhitektura (sekcija 3), svi WebSocket eventi iz sekcije 5 (gost i staff).

Modul A dodatno uključuje **Split the Bill** (`pwa/app/r/[slug]/t/[tableId]/bill-modal.tsx`
+ `GET /api/orders/bill/:tableId`) — jednaki dijelovi ili po stavkama
(preko `added_by` koji se sad prenosi od korpe kroz cijelu narudžbu). Modul D
dodatno uključuje **Takeaway/Pickup** (`pwa/app/takeaway/[slug]`,
`POST /api/orders/takeaway/:slug`) — naruči od kuće, gotovina/kartica pri
preuzimanju (bez pravog online plaćanja), narudžba se vidi na KDS-u
označena "🛍️ Preuzimanje" sa imenom gosta i vremenom umjesto stola.
Najranije vrijeme preuzimanja je **dinamičko** (`GET
/api/orders/takeaway/:slug/earliest-pickup` — 15 min baza + 4 min po
trenutno aktivnoj narudžbi u kuhinji, max 90 min), ne fiksna konstanta —
testirano stvarnim opterećenjem baze (0 aktivnih → 15 min, 10 aktivnih → 55
min, prerano izabran termin se odbija sa tačnim sljedećim slotom).

Modul E dodatno uključuje **upravljanje osobljem** (`admin/app/staff`,
`GET/POST/PATCH/DELETE /api/staff`) — kreiranje naloga, promjena uloge,
aktivan/neaktivan, reset lozinke; zaštićeno RolesGuard-om (ADMIN/MANAGER) i
samozaštitom (nalog ne može obrisati/deaktivirati sam sebe) — oba testirana
stvarnim pozivima.

Modul A dodatno uključuje **multi-language prekidač** (`pwa/lib/locale.ts`
+ `components/language-switcher.tsx`) — auto-detekcija jezika browsera
(bs/hr/sr → zajednički `bs` prevod, en/de/it eksplicitno) sa ručnim izborom
koji pamti `localStorage`; testirana logika mapiranja i fallback lanca za
sve kombinacije.

Modul E dodatno uključuje **pravi PDF/Excel izvoz** (`api/src/analytics/report-*.generator.ts`,
`GET /api/analytics/report?format=xlsx|pdf`) — objedinjeni izvještaj
(pregled + najprodavaniji artikli + stolovi) kao stvarni `.xlsx` (ExcelJS,
tri lista, pravi brojevi) ili `.pdf` (pdfkit), ne CSV preimenovan u drugu
ekstenziju — provjereno da su fajlovi validni (`file` prepoznaje xlsx kao
"Microsoft Excel 2007+", pdf ima ispravan `%PDF-1.3` potpis, xlsx učitan
nazad kroz ExcelJS sa tačnim podacima).

Dodatno (posljednji prolaz — "riješi sve" lista): **SMS/WhatsApp
podsjetnici i potvrde rezervacije** (`api/src/notifications/`, Twilio) —
potvrda odmah pri rezervaciji i podsjetnik cron-om 105–135 min prije
termina; **pravi online payment gateway** (`api/src/payments/`, Stripe
Checkout + webhook potpis) za takeaway narudžbe plaćene karticom;
**geofencing/Wi-Fi anti-fraud** (`websocket-gateway/src/table-session/geo.util.ts`
— Haversine udaljenost od GPS koordinata restorana i/ili provjera IP-a
uređaja) pri `join_table_session`; **odobravanje narudžbi prije slanja u
kuhinju** (`requireOrderApproval` po restoranu — QR narudžba čeka konobara,
tek tad ide na štampu); **podešavanje IP-a/porta printera, geofencinga,
Twilio/Stripe kredencijala kroz UI** (`admin/app/settings`) — **kredencijali
trećih strana se čuvaju PO RESTORANU u bazi (ne u `.env`)**, tako da svaki
restoran unosi svoje vlastite Twilio/Stripe naloge; refresh token mehanizam
(`/auth/refresh`, 30d) sa tihim obnavljanjem u sve tri staff aplikacije;
rate limiting (`@nestjs/throttler` — 100 req/min globalno, 10/min na
`/auth/login`); PWA ikone/manifest (pravi generisani PNG-ovi, ne
placeholder); Sentry error tracking (opcion, no-op bez `SENTRY_DSN`);
Docker + CI + Jest test suite (vidi ispod).

Sve navedeno u ovom pasusu je **stvarno testirano** protiv žive
Postgres/Redis instance (ne samo tsc/build): refresh-token rotacija i
odbijanje pogrešnog/isteklog tokena, rate limit (13 brzih zahtjeva → prvih
10 prođe, 11-13 vrate 429), maskiranje tajni (parcijalni update ne briše
postojeći `auth_token`/`stripe_secret_key`, sirova tajna se nikad ne vraća u
GET odgovoru), Twilio/Stripe sa lažnim ali ispravno formatiranim
kredencijalima — potvrđeno da poziv STVARNO stiže do njihovog API-ja
(`Authentication Error - invalid username` / `Invalid API Key provided`, ne
tihi stub), geofencing (4/4 provjere: unutar radijusa, van radijusa, bez
koordinata kad je radijus podešen, pogrešan IP), odobravanje narudžbi (8/8
provjera toka pending_approval → pending/cancelled).

## Docker

Svaki servis ima svoj `Dockerfile` (multi-stage; Next.js aplikacije koriste
`output: 'standalone'` za manju sliku). Root [`docker-compose.yml`](docker-compose.yml)
orkestrira Postgres, Redis i svih 6 cloud servisa (api, websocket-gateway,
pwa, kds, waiter, admin):

```bash
cp .env.example .env   # popuni JWT_SECRET, lozinke, PWA_BASE_URL, NEXT_PUBLIC_* ...
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
```

`print-gateway` je **namjerno isključen** iz root compose-a — taj agent mora
raditi na lokalnoj mreži restorana (isti LAN kao termalni printeri na portu
9100), ne u cloudu. Za restorane koji žele agenta u kontejneru (npr. na
Raspberry Pi-u) postoji odvojen [`docker-compose.print-gateway.yml`](docker-compose.print-gateway.yml).

**Poštena napomena:** ovi Dockerfile/compose fajlovi su pažljivo napisani i
ručno provjereni (sintaksa, redoslijed slojeva, `.dockerignore`, build-arg
prosljeđivanje `NEXT_PUBLIC_*` varijabli u Next.js build), ali **nisu
stvarno izgrađeni ni pokrenuti** — na ovoj razvojnoj mašini nije instaliran
Docker Desktop. Za razliku od PostgreSQL/Redis (male, ciljane instalacije),
Docker Desktop na Windowsu traži WSL2/Hyper-V i po pravilu restart mašine —
odluka je ostavljena korisniku. `docker-build` job u CI-u (ispod) će ih
stvarno graditi čim repo dobije GitHub Actions runner.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) pokreće za svaki
servis install → typecheck → build (a za `api` dodatno pravi Postgres servis
kontejner + `prisma migrate deploy` + Jest test suite), zatim jedan
`docker-build` job koji gradi svih 6 cloud-servisnih slika.

**Poštena napomena:** ovaj folder trenutno **nije git repozitorij** (nema
`.git` foldera), pa GitHub Actions workflow ne može ništa pokrenuti dok se
ne uradi `git init`, doda GitHub remote i pushuje — fajl je spreman i čeka
taj korak.

## Testiranje (API)

`api/` ima Jest test suite fokusiran na poslovnu logiku (ne integracione
testove — ti su već stvarno izvršeni ručno protiv žive baze, vidi gore):

```bash
cd api && npm test          # 54/54 prolazi
```

Pokriveno: `OrdersService` (obračun cijene IZ BAZE ne iz klijentovog
payloada, modifikatori, `added_by` threading za split-bill, status
`pending_approval`/`pending` zavisno od `requireOrderApproval` i
`isGuestOrder`, `approveOrder`/`rejectOrder` prelazi, grupisanje računa po
gostu), `AnalyticsService` (agregacija prihoda/prosjeka, top artikli
sortirani po količini, prosječno vrijeme pripreme, prihod po stolu — sve sa
zaokruživanjem i ivičnim slučajevima poput 0 narudžbi/obrisanog artikla),
`AuthService` (login uspjeh/pogrešna lozinka/nepostojeći/deaktiviran nalog,
refresh uspjeh/istekao token/pogrešan tip tokena/obrisan korisnik) — svi sa
pravim `bcrypt` hash-om, ne mock-ovanim poređenjem lozinke.

Ispravnost samih testova (a ne samo da "prolaze") potvrđena namjernim ubacivanjem
bug-a u obračun modifikatora (`orders.service.ts`) — test je pao sa tačnom
razlikom (33 očekivano, 29 dobijeno), pa je bug vraćen i suite ponovo prošao.

## Multi-tenant SaaS sloj (self-registracija, super-admin, naplata)

Dodano nakon pitanja "je li sajt kompletan": platforma sad podržava **javnu
self-service registraciju** novih restorana, **platform-admin** (super-admin)
upravljanje svim tenantima, i **naplatu restorana platformi preko Lemon
Squeezy** (odvojeno od Stripe-a, koji je za goste restorana da plate hranu).

- **Self-registracija** (`POST /auth/register`, `admin/app/register`) — javna
  forma kreira nov `Restaurant` + prvi `StaffUser` (role ADMIN) u jednoj
  transakciji, sa 14-dnevnim `trialing` periodom (`TRIAL_DAYS`), i odmah
  prijavljuje (isti oblik odgovora kao login). Slug se automatski generiše iz
  naziva restorana (transliteracija bs/hr/sr dijakritika, uklj. `đ` koje se
  NE razlaže pod Unicode NFD normalizacijom pa se posebno mapira na `d`) uz
  garanciju jedinstvenosti (`-2`, `-3`, ...).
- **"Zaboravljena lozinka"** (`POST /auth/forgot-password` + `/reset-password`,
  `admin/app/forgot-password` + `/reset-password`) — jednokratan token (1h),
  generički odgovor bez obzira postoji li email (anti-enumeracija), transakcioni
  email preko `EmailService` (nodemailer, **globalni** SMTP jer je ovo poruka
  OSOBLJU, ne gostu restorana) — bez `SMTP_HOST` graciozno ispisuje link u log
  (dev fallback), isti obrazac kao `NotificationsService` bez Twilio-a. Konobar/KDS
  login ekrani linkuju na admin panelov tok (`NEXT_PUBLIC_ADMIN_URL`) umjesto
  da ga dupliraju u sve tri staff app-a.
- **Platform-admin / super-admin** (`GET/PATCH /platform/*`, `admin/app/platform`)
  — nova uloga `SUPER_ADMIN` (`StaffUser.restaurantId` opciono, `onDelete: SetNull`)
  vidi sve restorane, agregatnu statistiku (broj restorana, aktivne pretplate,
  narudžbe/24h), i može suspendovati/reaktivirati tenant. Suspenzija (`is_active: false`)
  **stvarno blokira** gosta — već postojeća provjera u `menu.service.ts`/`tables.service.ts`
  plus nova provjera u `websocket-gateway`-jevom SQL upitu za `join_table_session`
  (gost sa keširanim QR linkom ne zaobilazi suspenziju). Bootstrap prvog
  SUPER_ADMIN naloga: `npm run create-super-admin` (čita `SUPER_ADMIN_EMAIL`/`_PASSWORD` iz `.env`).
- **Lemon Squeezy naplata** (`POST /billing/checkout`, `GET /billing/status`,
  `POST /billing/webhook`, `admin/app/billing`) — restoran plaća PLATFORMI
  (nama), zato su kredencijali **globalni env** (`LEMONSQUEEZY_*`), za razliku
  od Twilio/Stripe koji su po restoranu (restoran plaća gost/kupac). Webhook
  HMAC-SHA256 potpis verifikovan nad sirovim tijelom (`req.rawBody`, isti
  mehanizam kao Stripe webhook), mapira Lemon Squeezy status
  (`on_trial`/`active`/`past_due`/`cancelled`/`expired`/`paused`) na naš
  interni `subscriptionStatus`.

Sve navedeno je **stvarno testirano** protiv žive baze preko pravih HTTP
poziva (ne samo tsc/build): registracija sa bosanskim dijakriticima (uklj. đ)
→ tačan slug, duplikat email → 409, billing status vraća `trialing` odmah
nakon registracije, checkout bez Lemon Squeezy konfiguracije → 400,
forgot→reset→login sa novom lozinkom pun ciklus, ponovna upotreba
iskorišćenog reset tokena → 400, SUPER_ADMIN login/lista/statistika/suspenduj/
reaktiviraj, gost blokiran na suspendovanom restoranu (i REST `/menu/public`
i websocket-gateway-ov SQL upit direktno), obični ADMIN dobija 403 na
`/platform/*`, SUPER_ADMIN na restaurant-scoped ruti (`/restaurants/me`)
dobija čist 404 umjesto pada servera (sentinel `restaurant_id` dizajn).

**Poštena napomena:** ostaje van obima — stvarni deploy/hosting/domena/SSL
(sve i dalje radi samo lokalno, vidi Docker sekciju iznad).

## Sigurnost i "SaaS higijena" (drugi naknadni prolaz)

Nakon pitanja "šta nam je ostalo", korisnik je eksplicitno odvojio "bitno" (za
kasnije) od "vrijedi razmisliti" (odraditi odmah). Ovo je ta druga grupa —
sve niže je **stvarno testirano** protiv žive baze preko pravih HTTP poziva.

- **Email verifikacija** (`POST /auth/verify-email`, `/resend-verification`)
  — self-registracija odmah šalje link (24h), ali **ne blokira** login/rad
  (isti pristup kao većina SaaS platformi — trial i dalje radi
  neverifikovan). `AdminNav` prikazuje banner sa "Pošalji ponovo" dokle god
  `email_verified` nije `true`. Testirano: link stvarno mijenja
  `email_verified` sa `false` na `true`, ponovni zahtjev za nepostojeći ili
  već verifikovan email vraća isti generički odgovor (anti-enumeracija).
- **Audit log za super-admin akcije** (`GET /platform/audit-log`,
  `PlatformAuditLog` tabela, prikazano na `/platform`) — svaka
  suspenzija/reaktivacija bilježi ko (email), šta i kada, bez FK na restoran
  (zapis preživi i da je restoran ikad obrisan). Testirano: dva zapisa
  (`suspend_restaurant`, `activate_restaurant`) sa tačnim redoslijedom nakon
  stvarnog poziva.
- **At-rest enkripcija tajnih polja** (`common/encryption/`, AES-256-GCM,
  `ENCRYPTION_KEY` env) — Twilio auth token i Stripe secret/webhook key se
  sad enkriptuju PRIJE upisa u Postgres i dekriptuju samo u trenutku
  stvarne upotrebe (Twilio/Stripe klijent). Testirano: sirova vrijednost u
  bazi nije plaintext (ima `iv:authTag:ciphertext` oblik), a
  Twilio/Stripe pozivi sa dekriptovanim vrijednostima i dalje stvarno
  funkcionišu (rezervacija je poslala SMS pokušaj, takeaway narudžba je
  pokušala Stripe checkout, oboje sa lažnim ali ispravno dekriptovanim
  kredencijalima).
- **Dvofaktorska autentikacija (TOTP 2FA)** — `POST /auth/2fa/setup` (QR
  kod preko istog `qrcode` paketa kao floor plan), `/2fa/enable` (traži prvi
  ispravan kod prije aktivacije), `/2fa/disable` (traži lozinku, ne samo
  važeći JWT), i dvokoračni `login()` → `requires_2fa` + `pre_auth_token`
  → `POST /auth/2fa/verify`. Admin panel ima `/account` ekran za
  podešavanje. Testirano end-to-end sa **stvarno izračunatim** TOTP kodom
  (RFC 6238, HMAC-SHA1 preko Node `crypto`, ista matematika kao otplib) —
  pogrešan kod stvarno odbijen, ispravan stvarno prihvaćen.
- **Zaključavanje naloga nakon neuspjelih prijava** (`MAX_LOGIN_ATTEMPTS`,
  default 5, `LOGIN_LOCKOUT_MINUTES`, default 15) — po nalogu, ne samo po IP-u
  (rate limit na `/auth/login` je po IP-u i ne pomaže protiv napadača koji
  rotira IP-ove). Testirano: 5 pogrešnih lozinki zaredom zaključava nalog, 6.
  pokušaj sa TAČNOM lozinkom se i dalje odbija dok zaključavanje ne istekne.
- **Pravne stranice** (`admin/app/terms`, `/privacy`) — jasno označene kao
  **predlošci, ne pravno provjereni dokumenti** (amber upozorenje na vrhu
  svake stranice), sa placeholder poljima za naziv firme/jurisdikciju.
  Registracija sad zahtijeva potvrdu checkbox-a prije slanja forme.

**Usput pronađena i ispravljena prava greška** (ne kozmetička): `POST
/orders/takeaway/:slug` (javna, bez autentikacije) je vraćala CIJELI
`restaurant` objekat u odgovoru narudžbe, uključujući enkriptovane
Twilio/Stripe tajne (ciphertext, ali i dalje interna polja koja anonimni
pozivalac nikad ne bi trebao vidjeti). Otkriveno dok sam testirao
enkripciju uživo — ispravljeno tako da `OrdersService.create()`/`approveOrder()`
sad eksplicitno SELEKTUJU samo (`id`, `name`, printer IP/port polja) umjesto
`restaurant: true`, uz regresioni test koji provjerava da select objekat
NIKAD ne sadrži `twilioAuthToken`/`stripeSecretKey`/`stripeWebhookSecret`.

**Namjerno ostavljeno van obima ovog prolaza** (spada u "bitno" listu,
korisnik je rekao da to ostaje za kasnije): stvarno zaključavanje pristupa
kad pretplata istekne (`/billing` i dalje samo prikazuje status), Lemon
Squeezy nije povezan na pravu prodavnicu, i dalje nije git repozitorij niti
deployano.

## Redizajn admin panela + landing stranica + webshop (treći naknadni prolaz)

Korisnik je prvi put vizuelno pogledao panel i tražio redizajn ("ne sviđa mi
se dizajn ni funkcije"), pa dodatno landing stranicu i webshop za prodaju
termalnih printera (hardver koji restorani koriste sa Print Gateway agentom).

- **Dizajn sistem** (`admin/components/ui/`) — Radix UI primitivi + Tailwind
  (shadcn/ui obrazac): Button, Card, Input, Table, Dialog, Sheet, Dropdown,
  Tabs, Switch, Badge, Toast (sonner). Topla narandžasta paleta preko CSS
  varijabli (`app/globals.css`), Inter font.
- **Responzivan app shell** (`components/app-shell.tsx`) — sidebar na
  desktopu, hamburger meni + donja tab traka na mobitelu/tabletu. Tlocrt
  stolova (`/tables`) se sad automatski skalira (`ResizeObserver` + CSS
  transform) da stane na uži ekran bez horizontalnog skrolovanja — pointer
  drag delta se dijeli sa faktorom skaliranja da prevlačenje ne "bježi".
- **Dashboard** (`/dashboard`) — nova početna stranica nakon prijave
  (promet/narudžbe danas, top artikli, brze akcije, trial banner).
- **Restoran profil u Postavkama** — naziv/adresa restorana ranije nisu bili
  editabilni nigdje (backend DTO ih nije ni primao) — dodano.
- **Landing stranica** (`/`, `components/landing-page.tsx`) — ranije je `/`
  samo preusmjeravao na `/login` bez ikakve javne marketinške stranice.
  Server component (ne "use client") — marketinški sadržaj je odmah u
  početnom HTML-u (SEO, brzo prvo iscrtavanje), a `AuthRedirect` (mala
  nevidljiva client komponenta) preusmjerava već prijavljene korisnike.
- **Webshop** (`/shop`, `api/src/shop/`) — platforma prodaje termalne
  printere restoranima (odvojeno od hrane koju gost naručuje kod restorana
  preko QR koda — `ShopProduct`/`ShopOrder`/`ShopOrderItem` su potpuno
  odvojeni modeli od `Order`/`OrderItem`). Plaćanje preko Lemon Squeezy
  (`custom_price` override na checkout-u, isti store kao pretplata — jedan
  zajednički webhook endpoint u `BillingController` sad grana po
  `event_name` na pretplatu ili webshop narudžbu). Cijena/zalihe se UVIJEK
  računaju iz baze, nikad iz klijentovog payloada (regresioni test + uživo
  potvrđeno da endpoint odbacuje pokušaj slanja `price_cents` sa klijenta).
  `/platform/shop-products` i `/platform/shop-orders` — SUPER_ADMIN CRUD
  proizvoda i upravljanje narudžbama/statusima dostave. Seed skripta
  (`npm run seed-shop-products`) puni dva realna proizvoda (58mm/80mm LAN
  printeri).

Sve testirano uživo: javna lista/pojedinačan proizvod, kreiranje narudžbe sa
tačnim ukupnim iznosom, umanjenje zaliha unutar transakcije, odbijanje
prekoračenja zaliha, odbijanje ubačene cijene sa klijenta (whitelist),
SUPER_ADMIN CRUD i promjena statusa, 403 za običnog restoranovog ADMIN-a na
`/platform/shop/*` rutama. 84/84 Jest testova prolazi (10 novih za
`ShopService`).

## Uploads, cijena, konobar/KDS redizajn, pouzeće, pretraga i redoslijed (četvrti naknadni prolaz)

- **Upload slike umjesto linka** (`api/src/uploads/`) — i meni artikli i
  webshop proizvodi su ranije zahtijevali da korisnik nalijepi URL slike.
  Sad je pravi upload (multer, disk storage u `api/uploads/`, statički
  serviran preko `NestExpressApplication.useStaticAssets`, MIME/veličina
  validacija, apsolutni URL preko `API_PUBLIC_URL` da slika ispravno radi i
  sa drugih origin-a poput gost PWA-a). `admin/components/image-upload-field.tsx`
  + `admin/lib/api.ts`: `uploadMenuItemImage`/`uploadShopProductImage`.
- **Preporučena cijena na landingu** — 79 KM/mjesečno, dodana Pricing
  sekcija na landing stranicu.
- **Redizajn menija** (`/menu`) — kategorije kao horizontalni tabovi +
  vizuelne kartice artikala (slika/cijena/dostupnost), modifikatori
  premješteni u formu za uređivanje artikla.
- **Konobar i KDS redizajn** (`waiter/`, `kds/`) — isti dizajn sistem
  (Radix + CVA + Tailwind CSS varijable) prenesen i u ova dva app-a, koja su
  do sad ostala na sirovom Tailwind stone/brand stilu iz prve verzije.
  Konobar dobija istu toplu/svijetlu paletu kao admin/gost PWA; KDS
  namjerno ostaje TAMNA tema (kuhinjski ekran je upaljen cijelu smjenu u
  vrućoj/zamašćenoj kuhinji — tamna pozadina smanjuje odsjaj), sad kao
  eksplicitni token set, ne ad-hoc `stone-*`/`bg-card` klase. Sve funkcije
  (WebSocket eventi, alarm za nove narudžbe, boja kartice po vremenu čekanja,
  86-ing panel, ručni unos narudžbe, poziv konobara/računa) su netaknute -
  redizajn je bio isključivo markup/stilizacija.
- **Plaćanje pouzećem za webshop** (`ShopOrder.paymentMethod`) — restoran je
  odlučio da se hardver plaća pouzećem (gotovina kuriru), ne online karticom.
  `'cod'` je podrazumijevano i trenutno JEDINO ponuđeno u `/shop` (jasna
  poruka na checkout-u i potvrdi narudžbe); `'card'` (Lemon Squeezy) ostaje
  podržan u kodu za kad se poveže prava prodavnica, samo nije izložen u UI-ju.
- **Thumbnail slike u `/platform/shop-products`** — lista proizvoda sad
  prikazuje sliku, ne samo tekst.
- **Pretraga artikala u meniju** — polje za pretragu po nazivu koje pretražuje
  SVE kategorije odjednom (korisno za restorane sa puno artikala), sa
  oznakom kategorije na rezultatu.
- **Drag-and-drop redoslijed** kategorija i artikala u meniju — zamijenjen
  ručni `sort_order` broj pravim prevlačenjem (HTML5 Drag and Drop API,
  optimističko ažuriranje UI-ja pa čuvanje `sort_order` za sve pogođene
  redove). `MenuItem` je dobio novo `sortOrder` polje (ranije su se artikli
  redali samo po `createdAt`); novi artikal se dodaje NA KRAJ kategorije
  (max trenutni `sortOrder` + 1), ne remeti postojeći redoslijed.

Sve provjereno uživo (pravi API + Postgres): COD narudžba nema
`payment_url` i vidljiva je u admin listi sa oznakom "Pouzeće"; prevlačenje
dva artikla zamijeni im `sortOrder` i redoslijed se vrati kod ponovnog
učitavanja; novi artikal dobija ispravan `sortOrder` na kraju kategorije.
92/92 Jest testova prolazi (8 novih: COD ponašanje u `ShopService`,
redoslijed/tenant-izolacija u novom `MenuService` paketu testova, potvrđeno
bug-injekcijom da test stvarno hvata regresiju). `waiter`/`kds`/`admin` grade
se čisto (4/4, 4/4, 24/24 stranica) i tipovi prolaze bez grešaka.
