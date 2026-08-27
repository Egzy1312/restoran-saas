# MVP Roadmap — Restoran SaaS Platforma
**Cilj: funkcionalna, demo-spremna verzija za jedan pilot restoran za 30 dana.**

Pretpostavljeni tim: 1 backend dev, 1 frontend dev, 1 fullstack/DevOps (može biti ista osoba za manji tim), povremeno QA.
Van obima MVP-a (Faza 2, nakon 30 dana): geofencing/Wi-Fi anti-fraud, split-bill po stavci, web widget za ugradnju, SMS/WhatsApp podsjetnici, multi-jezik za sve od dana 1 (počinje sa BS/EN), napredna analitika/izvoz.

---

## Sprint 1 (Dan 1–7): Temelji — baza, auth, admin CRUD
**Cilj: podaci i infrastruktura na kojima sve ostalo stoji.**

- Postavljanje repo strukture (monorepo: `apps/web`, `apps/admin`, `apps/api`, `apps/print-gateway`), CI lint/build.
- Provisioning: PostgreSQL (Neon/RDS/self-host), Redis, staging environment.
- Implementacija DDL šeme iz specifikacije + migracije (Prisma/TypeORM/Knex).
- Auth za osoblje: JWT login (admin, konobar, kuhinja), role-based guards. Gost ostaje bez naloga.
- Admin Panel v1 (CRUD): restorani (single-tenant za pilot, ali multi-tenant šema od početka), kategorije menija, artikli, modifikatori, upload slika (S3/R2).
- Visual Floor Plan Editor v0: jednostavan grid-based unos stolova (broj, zona, kapacitet) — bez pune drag-and-drop preciznosti, ali generiše `qr_code_token` i printable QR listić po stolu.
- **Deliverable:** Admin može kreirati restoran, meni i stolove; QR kodovi se generišu i mogu odštampati.

## Sprint 2 (Dan 8–15): Gost — digitalni meni i narudžba
**Cilj: gost skenira QR i naruči; narudžba stiže u sistem u realnom vremenu.**

- PWA meni (Next.js): ruta `/r/{slug}/t/{table_id}`, prepoznavanje stola iz QR tokena, manifest + service worker (installable, offline-cache za statični meni).
- Prikaz kategorija/artikala sa slikama, opisima, alergenima, filterima (vegan/vegetarian/gluten-free).
- Modifikatori pri dodavanju u korpu (odabir, dodaci, napomena "bez luka").
- **WebSocket Gateway** (vidi isporučeni kod): `join_table_session`, zajednička korpa po stolu, `cart_updated` broadcast svim uređajima za stolom.
- `place_order` flow: korpa → narudžba → `orders`/`order_items` u bazi, status `pending`.
- Dugmad "Pozovi konobara" / "Zatraži račun" (`call_waiter` event) — za sada samo upisuju event i notifikaciju (UI za konobara dolazi u Sprintu 4).
- **Deliverable:** Gost sa telefona skenira QR, naruča, više gostiju za istim stolom vidi istu korpu uživo.

## Sprint 3 (Dan 16–22): Kuhinja (KDS) i Print Gateway
**Cilj: narudžba iz Sprinta 2 vidljiva je kuhinji na ekranu i izlazi na fizičkom printeru.**

- KDS web app (touch-optimized, `/kds` za autentikovano osoblje): karte narudžbi uživo preko `new_order_received`, bojanje po vremenu čekanja (zeleno/žuto/crveno), status flow `Primljeno → U pripremanju → Spremno`.
- "86-ing": kuhar označava artikal nedostupnim → `menu_items.is_available = false` → gostima se odmah sakriva/onemogućava u meniju (WS push ili polling na meniju).
- Zvučna obavijest na novu narudžbu dok se ne potvrdi.
- **Print Gateway Agent** (vidi isporučeni kod): backend na `place_order` određuje `print_target` po artiklu (kuhinja/šank), server emituje `print_job_dispatch` po printeru; agent na lokalnoj mašini/Raspberry Pi prima event, formatira ESC/POS i šalje na IP:9100 termalnog printera.
- Testiranje sa realnim ili emuliranim (`escpos-printer-emulator`/netcat) termalnim printerom.
- **Deliverable:** Narudžba gosta se pojavljuje na KDS-u i automatski se štampa razdvojeno (kuhinja/šank) bez ručnog unosa.

## Sprint 4 (Dan 23–30): Konobarski modul, tlocrt, stabilizacija, deploy
**Cilj: zatvoriti petlju osoblje ↔ gost, testirati end-to-end, pustiti u produkciju kod pilot restorana.**

- Konobarski mobilni web: pregled tlocrta sa statusima stolova (slobodan/čeka hranu/poslužen/traži račun/poziva — boje + treperenje na `call_waiter`/`order_status_changed`).
- Ručni unos narudžbe od strane konobara (isti `place_order` put, `order_type` fleksibilan).
- Opcioni "odobri narudžbu" mod prije slanja u kuhinju (feature flag po restoranu).
- Osnovna analitika: najprodavaniji artikli, broj narudžbi/dan, prosječno vrijeme priprema (razlika `status_changed` timestamps) — jedan dashboard ekran, bez PDF/Excel exporta (Faza 2).
- End-to-end testiranje kompletnog toka: QR → narudžba → KDS → print → poslužen → račun.
- Hardening: rate limiting na gost API/WS, validacija QR tokena, error tracking (Sentry), logging, deploy na produkciju (Docker Compose ili K8s ako je predviđeno rasti), TLS, backup baze.
- Onboarding dokument za pilot restoran (kako povezati printere, kako otvoriti dan).
- **Deliverable:** Kompletan happy-path radi uživo kod jednog pilot restorana; sistem spreman za prikupljanje povratnih informacija za Fazu 2.

---

## Rizici i napomene
- **Print Gateway pouzdanost** je kritičan put za MVP — testirati offline-printer scenario (queue + retry) rano, ne ostavljati za kraj Sprinta 3.
- **WebSocket skaliranje** (Redis adapter) nije nužno za jedan pilot restoran, ali kod je pisan tako da se uključi bez refaktora kad bude više instanci servera.
- Multi-tenant izolacija (restaurant_id na svim upitima) mora biti u fokusu od Sprinta 1, iako pilot ima samo jedan restoran — jeftinije je raditi ispravno od početka nego retrofit-ovati.
