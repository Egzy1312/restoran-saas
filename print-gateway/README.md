# Print Gateway Agent

Lokalni pozadinski proces koji se pokreće na računaru kase ili Raspberry Pi
uređaju unutar restorana. Drži otvorenu WebSocket vezu sa cloud serverom,
prima `print_job_dispatch` događaje i šalje formatirane ESC/POS komande
direktno na LAN IP adresu termalnog printera (port 9100, RAW/JetDirect).

## Zašto ovo mora biti poseban proces
Browser preko HTTPS-a ne može otvoriti sirovi TCP socket na privatnu IP
adresu (npr. `192.168.1.150:9100`) zbog sigurnosnih ograničenja preglednika
(mixed content / private network access). Zato server šalje print posao ovom
lokalnom agentu, koji radi izvan browser sandboxa i ima direktan pristup LAN
mreži restorana.

## Instalacija
```bash
npm install
cp .env.example .env
# popuniti SERVER_WS_URL, RESTAURANT_ID, AGENT_TOKEN i IP adrese printera
npm start
```

## Arhitektura
- `src/config.js` — učitavanje `.env` konfiguracije.
- `src/escpos-builder.js` — generiše sirove ESC/POS bajtove (naslov, stavke,
  modifikatori, napomene, buzzer, auto-cut), sa CP852 enkodiranjem za
  bosanske/hrvatske/srpske dijakritike (č, ć, ž, š, đ).
- `src/printer-client.js` — otvara TCP konekciju na `ip:port` i šalje bajtove,
  sa connect/write timeoutom i retry+backoff logikom.
- `src/job-queue.js` — perzistentni (JSON fajl) queue za poslove koji nisu
  uspjeli (printer ugašen/offline) — ništa se ne gubi, pokušava se ponovo pri
  sledećoj konekciji ili periodičnom provjerom (svakih 60s).
- `src/index.js` — glavni orkestrator: Socket.io klijent, primanje
  `print_job_dispatch`, dispatch ka printer-client-u, slanje `print_job_status`
  nazad serveru (za praćenje statusa u admin/KDS panelu).

## Smart Routing (razdvajanje kuhinja/šank)
Odluku o tome koji artikal ide na koji printer donosi **backend** (na osnovu
`menu_items.print_target`) — server šalje **jedan `print_job_dispatch` po
printeru**, već filtriran. Agent samo zna gdje (IP:port) poslati taj konkretan
posao. Ovo drži agenta jednostavnim i bez poslovne logike.

## Pouzdanost
- Ako je printer trenutno ugašen ili nedostupan, posao se retry-uje
  (`PRINT_RETRY_ATTEMPTS`), a ako i dalje ne uspije — upisuje se u lokalni
  queue i pokušava ponovo automatski.
- Ako agent (proces) padne dok postoje neispisani poslovi, queue je na disku
  (`data/pending-jobs.json`) pa se ništa ne gubi nakon restarta.

## Testiranje bez fizičkog printera
`fake-printer.js` (uključen u ovom repou) emulira TCP printer i ispravno
dekodira CP852 da se odmah vidi čitljiv tekst (dijakritike uklj.), ne sirovi hex:
```bash
node fake-printer.js 19100 kitchen
```
zatim podesiti `PRINTER_KITCHEN_IP=127.0.0.1` / `PRINTER_KITCHEN_PORT=19100`
(i restoranov `kitchen_printer_ip`/`port` u bazi, jer te vrijednosti šalje API,
ne lokalni `.env` fallback). Ovim putem je stvarno end-to-end testirano:
API → `print_job_dispatch` → agent → ESC/POS → TCP → primljeno i ispravno
dekodirano (uklj. Smart Routing razdvajanje kuhinja/šank u istoj narudžbi).

## Docker (opciono)
Agent NORMALNO radi kao goli Node proces na LAN mreži restorana (ne u
cloudu). Za restorane koji ipak žele kontejner (npr. na Raspberry Pi-u sa
Dockerom), postoji `Dockerfile` + root [`docker-compose.print-gateway.yml`](../docker-compose.print-gateway.yml)
(`network_mode: host` — mora moći direktno gađati `192.168.x.x:9100`):
```bash
docker compose -f ../docker-compose.print-gateway.yml up -d --build
```
