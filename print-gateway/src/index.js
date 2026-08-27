'use strict';

/**
 * Print Gateway Agent
 * ---------------------------------------------------------------------
 * Pokrece se na lokalnom racunaru kase ili Raspberry Pi uredjaju unutar
 * restorana. Drzi otvorenu Socket.io konekciju sa cloud serverom, prima
 * `print_job_dispatch` dogadjaje, formatira narudzbu u ESC/POS bajtove
 * i salje ih direktno na LAN IP termalnog printera (port 9100).
 *
 * Zasto ovaj agent uopste postoji: browser (HTTPS) ne moze otvoriti sirovi
 * TCP socket na lokalnu (privatnu) IP adresu printera zbog sigurnosnih
 * ogranicenja - zato server salje print posao ovom lokalnom procesu, koji
 * NIJE ogranicen browser sandboxom.
 *
 * Pokretanje:
 *   cp .env.example .env   # popuniti SERVER_WS_URL, RESTAURANT_ID, AGENT_TOKEN
 *   npm install
 *   npm start
 */

const { io } = require('socket.io-client');
const config = require('./config');
const logger = require('./logger');
const { buildOrderTicket } = require('./escpos-builder');
const { sendToPrinterWithRetry } = require('./printer-client');
const JobQueue = require('./job-queue');

const queue = new JobQueue();

// Lokalni fallback mapping printera - moze biti prepisan porukom `printer_config`
// koju server posalje odmah nakon uspjesne autentikacije (da restoran moze
// promijeniti IP printera iz admin panela bez redeploy-a agenta).
let printerMap = { ...config.printers };

const socket = io(config.serverWsUrl, {
  path: '/agents',
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 15000,
  auth: {
    role: 'print_agent',
    restaurant_id: config.restaurantId,
    token: config.agentToken,
  },
});

socket.on('connect', () => {
  logger.info(`Povezan na server (${config.serverWsUrl}) kao print-agent za restoran ${config.restaurantId}`);
  socket.emit('agent_ready', { restaurant_id: config.restaurantId });
  drainQueue();
});

socket.on('disconnect', (reason) => {
  logger.warn(`Prekinuta konekcija sa serverom: ${reason}. Pokusavam ponovnu konekciju...`);
});

socket.on('connect_error', (err) => {
  logger.error(`Greska pri konekciji na server: ${err.message}`);
});

// Server moze poslati azurirane IP adrese printera (npr. nakon promjene u admin panelu)
socket.on('printer_config', (cfg) => {
  printerMap = { ...printerMap, ...cfg };
  logger.info('Azuriran printer config sa servera', printerMap);
});

/**
 * Glavni event: server salje jedan print_job_dispatch PO printeru (Smart
 * Routing vec je odradjen na backendu - ovaj payload sadrzi samo stavke
 * namijenjene ovom konkretnom printeru).
 *
 * Ocekivani payload:
 * {
 *   job_id: 'uuid',
 *   print_target: 'kitchen' | 'bar',
 *   printer_ip: '192.168.1.150',   // opciono - override lokalnog mapiranja
 *   printer_port: 9100,            // opciono
 *   restaurant_name: 'Konoba Adriatic',
 *   table_number: '12',
 *   zone_name: 'Bašta',
 *   order_number: 481,
 *   order_notes: 'Gost slavi rodjendan',
 *   created_at: '2026-08-20T18:32:00Z',
 *   items: [
 *     { name: 'Ćevapi 10kom', quantity: 2, unit_price: 12.00,
 *       item_notes: 'bez luka', selected_modifiers: [{ name: 'Extra kajmak' }] }
 *   ]
 * }
 */
socket.on('print_job_dispatch', async (job) => {
  logger.info(`Primljen print posao ${job.job_id} (${job.print_target}) za sto ${job.table_number}`);
  await handlePrintJob(job);
});

async function handlePrintJob(job) {
  const target = printerMap[job.print_target] || {};
  const ip = job.printer_ip || target.ip;
  const port = job.printer_port || target.port || 9100;

  if (!ip) {
    logger.error(`Nema definisane IP adrese za print_target='${job.print_target}', posao ${job.job_id} odbacen.`);
    ack(job, 'failed', 'Nepoznat printer_target - provjerite konfiguraciju printera u admin panelu.');
    return;
  }

  let ticket;
  try {
    ticket = buildOrderTicket(job);
  } catch (err) {
    logger.error(`Greska pri formatiranju ESC/POS tiketa za posao ${job.job_id}: ${err.message}`);
    ack(job, 'failed', `Greska pri formatiranju: ${err.message}`);
    return;
  }

  try {
    await sendToPrinterWithRetry(ip, port, ticket, {
      attempts: config.retryAttempts,
      delayMs: config.retryDelayMs,
    });
    logger.info(`Posao ${job.job_id} uspjesno odstampan na ${ip}:${port}`);
    ack(job, 'printed');
  } catch (err) {
    logger.error(`Posao ${job.job_id} nije uspio na ${ip}:${port} nakon ${config.retryAttempts} pokusaja: ${err.message}`);
    queue.enqueue(job);
    ack(job, 'queued', `Printer nedostupan, posao je u lokalnom queue-u: ${err.message}`);
  }
}

/** Javlja serveru status posla (za praćenje na admin/KDS strani - npr. "printer offline" indikator). */
function ack(job, status, errorMessage) {
  if (!socket.connected) return;
  socket.emit('print_job_status', {
    job_id: job.job_id,
    restaurant_id: config.restaurantId,
    status, // 'printed' | 'failed' | 'queued'
    error: errorMessage,
    at: new Date().toISOString(),
  });
}

/** Pri startu / re-konekciji, pokusaj isprazniti sve poslove nagomilane dok je printer bio offline. */
async function drainQueue() {
  const pending = queue.list();
  if (!pending.length) return;

  logger.info(`Pokusavam isprazniti ${pending.length} zaostalih poslova iz lokalnog queue-a...`);
  for (const job of pending) {
    const target = printerMap[job.print_target] || {};
    const ip = job.printer_ip || target.ip;
    const port = job.printer_port || target.port || 9100;
    if (!ip) continue;

    try {
      const ticket = buildOrderTicket(job);
      await sendToPrinterWithRetry(ip, port, ticket, { attempts: 1, delayMs: 0 });
      queue.remove((item) => item.job_id === job.job_id);
      logger.info(`Zaostali posao ${job.job_id} uspjesno odstampan iz queue-a.`);
      ack(job, 'printed');
    } catch (err) {
      logger.warn(`Zaostali posao ${job.job_id} i dalje ne uspijeva: ${err.message}`);
      // ostaje u queue-u, pokusace se ponovo pri sljedecoj konekciji
    }
  }
}

// Periodicna provjera queue-a (npr. printer je bio ugasen, sad je upaljen,
// ali agent nije prosao kroz reconnect da bi se drainQueue automatski pozvao).
setInterval(() => {
  if (!queue.isEmpty()) drainQueue();
}, 60_000);

process.on('SIGINT', () => {
  logger.info('Gasim print-gateway agent...');
  socket.disconnect();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`Neuhvacen izuzetak: ${err.stack || err.message}`);
});
