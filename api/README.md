# API — Restoran SaaS

Glavni REST API: restorani, stolovi, meni, narudžbe, rezervacije, auth osoblja.
PostgreSQL preko Prisma. Ovo je izvor istine za sve ostale servise
(`websocket-gateway` čita stolove direktno iz baze, `print-gateway` prima
naloge koje ovaj API emituje preko `/agents` WebSocket namespace-a).

## Instalacija
```bash
npm install
cp .env.example .env          # popuniti DATABASE_URL, JWT_SECRET, itd.
npx prisma migrate dev --name init
npm run seed                  # kreira pilot restoran, admin nalog, 2 stola, par artikala
npm run start:dev
```

## Struktura
- `prisma/schema.prisma` — implementacija DDL šeme iz specifikacije (sekcija 4) +
  `staff_users` tabela za auth + IP/port polja printera na `restaurants` (za Smart Routing).
- `src/auth/` — JWT login za osoblje (`POST /api/auth/login`), role: ADMIN, MANAGER, WAITER, KITCHEN, BAR.
- `src/tables/` — CRUD stolova (admin), generisanje `qr_code_token`-a, javna `GET /api/tables/verify`.
- `src/menu/` — CRUD kategorija/artikala/modifikatora (admin, uklj. "86-ing" preko `is_available`),
  javni `GET /api/menu/public/:slug` za gost PWA (samo aktivni artikli, poštuje vremenske prozore kategorija).
- `src/orders/` — kreiranje narudžbe (rekalkulacija cijena iz baze, nikad sa klijenta),
  `src/orders/print-dispatch.gateway.ts` — WebSocket server na koji se povezuje **Print Gateway Agent**
  (`../print-gateway`), radi Smart Routing (kuhinja/šank) i emituje `print_job_dispatch`.
- `src/reservations/` — CRUD rezervacija + javna ruta za embeddable web widget.

## Kako se uklapa sa ostala dva servisa
- **print-gateway** (`../print-gateway`) povezuje se na `wss://.../agents` sa
  `{ role: 'print_agent', restaurant_id, token }` — token mora odgovarati
  `PRINT_AGENT_SHARED_SECRET` iz `.env`. Nakon svake `POST /api/orders`
  (uspješne narudžbe), `PrintDispatchGateway.dispatchOrder()` šalje po jedan
  `print_job_dispatch` za svaki printer koji ima stavki u toj narudžbi.
- **websocket-gateway** (`../websocket-gateway`) je gost-facing realtime sloj
  (zajednička korpa po stolu). Kad gost pošalje `place_order`, taj servis
  poziva `POST /api/orders/internal` (zaštićeno `X-Internal-Secret` headerom,
  vidi `INTERNAL_SERVICE_SECRET`) da bi narudžba stvarno završila u bazi i
  pokrenula print tok.

## Testni nalog (nakon `npm run seed`)
```
POST /api/auth/login
{ "email": "admin@konoba-adriatic.test", "password": "admin123" }
```

## Ostali moduli (dodano u kasnijim prolazima)
- `src/notifications/` — SMS/WhatsApp preko Twilio (**kredencijali po restoranu
  u bazi**, ne u `.env` — vidi `restaurants.twilio*` polja i `admin/app/settings`),
  potvrda rezervacije odmah + cron podsjetnik 105–135 min prije termina.
- `src/payments/` — Stripe Checkout za takeaway plaćanje karticom (**tajni
  ključ i webhook secret takođe po restoranu**), webhook na
  `POST /api/payments/webhook/:restaurantId`.
- Geofencing/IP provjera pri `join_table_session` je u `websocket-gateway`
  (`restaurants.geofenceRadiusMeters`/`allowedIp`), ovaj API samo čuva/vraća
  ta podešavanja preko `PATCH /api/restaurants/me`.
- `requireOrderApproval` (po restoranu) — QR narudžba staje na
  `pending_approval` dok je konobar ne odobri/odbije (`PATCH /orders/:id/approve|reject`).
- `/auth/refresh` — refresh token (30d), `@nestjs/throttler` na login/refresh
  i globalno (100 req/min).
- `src/analytics/report-*.generator.ts` — pravi `.xlsx` (ExcelJS)/`.pdf` (pdfkit) izvoz.
- `SENTRY_DSN` (opciono) — bez njega Sentry je potpun no-op.

## Multi-tenant SaaS sloj (dodano naknadno)
- `POST /auth/register` — self-service registracija (nov `Restaurant` + prvi ADMIN nalog).
- `POST /auth/forgot-password` + `/reset-password` — preko `src/email/` (nodemailer, globalni SMTP).
- `src/billing/` — pretplata restorana NA PLATFORMU preko Lemon Squeezy (**globalni** `LEMONSQUEEZY_*` env, za razliku od Twilio/Stripe koji su po restoranu).
- `src/platform-admin/` — `SUPER_ADMIN` uloga (`GET/PATCH /platform/*`), upravlja svim tenantima (suspenduj/reaktiviraj), potpuno odvojeno od restaurant-scoped ruta. `GET /platform/audit-log` bilježi ko/šta/kada.
- Bootstrap prvog SUPER_ADMIN naloga: `npm run create-super-admin` (čita `SUPER_ADMIN_EMAIL`/`_PASSWORD`/`_FULL_NAME` iz `.env`).

## Sigurnost (dodano naknadno)
- `POST /auth/verify-email` + `/resend-verification` — ne blokira login, samo prikazuje banner dok se ne potvrdi.
- `POST /auth/2fa/setup|enable|disable|verify` — TOTP (otplib), dvokoračni login (`requires_2fa` → `pre_auth_token` → `/2fa/verify`).
- Zaključavanje naloga (`MAX_LOGIN_ATTEMPTS`/`LOGIN_LOCKOUT_MINUTES`) nakon uzastopnih pogrešnih lozinki.
- `src/common/encryption/` — AES-256-GCM at-rest enkripcija Twilio/Stripe tajnih polja (`ENCRYPTION_KEY` env).

## Testovi
```bash
npm test          # Jest — OrdersService, AnalyticsService, AuthService, BillingService, PlatformAdminService (74 testa)
```

## Docker
```bash
docker build -t restoran-api .
```
Vidi root [`docker-compose.yml`](../docker-compose.yml) za punu orkestraciju.
