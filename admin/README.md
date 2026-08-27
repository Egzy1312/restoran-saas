# Admin Panel

Next.js aplikacija za vlasnika/menadžera restorana (modul E u specifikaciji):
menadžer menija, Visual Floor Plan Editor, osnovna analitika.

## Instalacija
```bash
npm install
cp .env.local.example .env.local   # API_BASE_URL i GUEST_PWA_URL (za QR linkove)
npm run dev
```
Prijava: `staff_users` nalog sa rolom `ADMIN` ili `MANAGER`. Nakon
`npm run seed` u `api`, koristi `admin@konoba-adriatic.test` / `admin123`.

## Ekrani

### `/menu` — Menadžer menija
CRUD kategorija (naziv bs/en, redoslijed, vremenski prozor npr. "Dnevni ručak
11:00–14:00") i artikala (naziv, opis, cijena, slika, alergeni, kuhinja/šank,
modifikatori). Prekidač dostupnosti je isti "86-ing" koji koristi i KDS —
promjena je odmah vidljiva i na gost PWA meniju.

### `/tables` — Visual Floor Plan Editor
Slobodno prevlačenje stolova po canvas-u (čist pointer-events pristup, bez
eksternih drag-and-drop biblioteka) — pozicija se čuva u `pos_x`/`pos_y`.
Klik na sto (bez prevlačenja) otvara panel sa **QR kodom** generisanim
lokalno (`qrcode` paket, bez eksternog servisa) — link je oblika
`{GUEST_PWA_URL}/r/{slug}/t/{qr_code_token}`, spreman za štampu i lijepljenje
na sto. Isti panel mijenja zonu/kapacitet i briše sto.

### `/reservations` — Pregled rezervacija
Lista rezervacija (uklj. onih koje su stigle sa embeddable widgeta na sajtu
restorana, modul D.2) sa terminom, brojem gostiju, kontaktom i odabranim
stolom (ili "Bilo koji sto"). Akcije: Završi / Ne dolazi / Otkaži
(`PATCH /reservations/:id/status`).

### `/analytics` — Izvještaji
Promet, broj narudžbi, prosječna vrijednost računa, prosječno vrijeme
pripreme (aproksimacija preko `updatedAt - createdAt` za narudžbe u statusu
`ready`/`served` — nema posebne tabele historije statusa), najprodavaniji
artikli i najprofitabilniji stolovi. Izvoz po tabeli u **CSV** (`?format=csv`),
plus **objedinjeni izvještaj** (pregled + oba spiska u jednom dokumentu) kao
**pravi .xlsx** (ExcelJS, tri lista) ili **pravi .pdf** (pdfkit) — ne CSV
preimenovan u drugu ekstenziju. Provjereno da su fajlovi stvarno validni:
`.xlsx` prepoznat kao "Microsoft Excel 2007+" i učitan nazad kroz ExcelJS sa
tačnim brojevima, `.pdf` počinje sa `%PDF-1.3` magic bytes potpisom.

### `/staff` — Osoblje
CRUD `staff_users` naloga (ranije samo preko seed skripte/direktnog upisa u
bazu): kreiranje (email, ime, početna lozinka, uloga), promjena uloge,
aktivan/neaktivan prekidač, reset lozinke, brisanje. Zaštićeno na dva nivoa:
`ADMIN`/`MANAGER` uloga (`RolesGuard` na `/api/staff` rutama — testirano da
`KITCHEN`/`WAITER` nalog dobija 403) i **samozaštita** — nalog ne može
deaktivirati ni obrisati sam sebe (testirano, oba vraćaju 400). Lozinke se
nikad ne vraćaju klijentu (eksplicitan `select` u API-ju, ne oslanja se na
serijalizaciju da ne bi procurio hash).

### `/settings` — Postavke
Printer IP/port (kuhinja/šank), geofencing (GPS radijus + dozvoljen IP),
"odobravanje narudžbi prije kuhinje", i Twilio/Stripe kredencijali **po
restoranu** (unose se ovdje, ne u `.env` — svaki restoran ima svoj nalog).

### `/billing` — Naplata (pretplata restorana NA platformu)
Status pretplate (`trialing`/`active`/`past_due`/`cancelled`), datum isteka
probnog perioda, dugme "Pretplati se" koje otvara Lemon Squeezy hosted
checkout. Odvojeno od Stripe-a u `/settings` (koji je za goste da plate hranu).

### `/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`
Javne (bez JWT-a) rute. `/register` — self-service registracija novog
restorana (kreira `Restaurant` + prvi ADMIN nalog, 14-dnevni trial, odmah
prijavljuje; zahtijeva potvrdu checkbox-a za `/terms` + `/privacy`).
`/forgot-password` + `/reset-password` — jedini "zaboravljena lozinka" tok
za sve tri staff app (konobar/KDS login ekrani linkuju ovamo preko
`NEXT_PUBLIC_ADMIN_URL`, ne dupliraju tok). `/verify-email` potvrđuje token
iz emaila poslatog pri registraciji (ne blokira login prije potvrde -
`AdminNav` samo prikazuje podsjetnik banner sa "Pošalji ponovo"). `/login`
podržava dvokoračnu 2FA prijavu (email+lozinka → kod iz authenticator
aplikacije, ako je nalog ima uključen).

### `/account` — Nalog i sigurnost
Uključivanje/isključivanje TOTP dvofaktorske autentikacije (2FA) - QR kod
za skeniranje (isti `qrcode` paket kao `/tables`), potvrda prvog koda prije
aktivacije, lozinka potrebna za isključivanje (ne samo važeći JWT).

### `/platform` — Platform-admin (uloga `SUPER_ADMIN`)
Vidljivo SAMO nalozima sa `role: 'SUPER_ADMIN'` (redirect na `/menu` za sve
ostale) — pregled svih restorana (tenanata), agregatna statistika,
suspenduj/reaktiviraj dugme po restoranu (`is_active` — stvarno blokira
gosta, ne samo kozmetika), i audit log (ko je i kada suspendovao/reaktivirao
koji restoran).

### `/terms`, `/privacy`
Generički predlošci (jasno označeni kao takvi, ne pravno provjereni
dokumenti) — linkovani sa `/register` i footer-a `/login` stranice.

### `/` — Landing stranica
Javna marketinška stranica (server component, ne "use client" — sadržaj je
odmah u HTML-u, brzo prvo iscrtavanje/SEO). Hero, mogućnosti, sekcija o
hardveru (link na `/shop`), "kako radi", CTA, footer. Već prijavljeni
korisnici se automatski preusmjere na svoj dashboard (`components/auth-redirect.tsx`).

### `/shop` — Webshop (termalni printeri)
Javna prodavnica hardvera — grid proizvoda sa količinama, korpa, i
jednostranični checkout (ime/email/telefon/adresa dostave). Cijena/zalihe se
uvijek računaju na backend-u. Ako je Lemon Squeezy podešen, preusmjerava na
hosted checkout; ako nije, narudžba ostaje "na čekanju" i kupac se
kontaktira ručno. `/platform/shop-products` i `/platform/shop-orders`
(SUPER_ADMIN) upravljaju katalogom i statusima dostave.

## Šta nedostaje
- Deploy/hosting/domena/SSL — sve i dalje radi samo lokalno (vidi root README, Docker sekcija).
- Stvarno zaključavanje pristupa kad pretplata istekne (`/billing` samo prikazuje status, ne blokira).
- Email potvrda ne blokira korištenje (namjerno, vidi gore) - ako se to promijeni, treba dodatna logika na login.
