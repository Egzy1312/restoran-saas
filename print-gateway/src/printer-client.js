'use strict';

const net = require('net');
const logger = require('./logger');

const CONNECT_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 8000;

/**
 * Salje sirove ESC/POS bajtove na termalni printer preko TCP socketa
 * (standardni RAW/JetDirect protokol na portu 9100).
 *
 * @param {string} ip
 * @param {number} port
 * @param {Buffer} data
 * @returns {Promise<void>}
 */
function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    socket.setTimeout(WRITE_TIMEOUT_MS);

    socket.connect(port, ip, () => {
      logger.debug(`TCP konekcija uspostavljena sa printerom ${ip}:${port}`);
      socket.write(data, (err) => {
        if (err) return fail(err);
        // Malo sacekamo da printer isprazni buffer prije zatvaranja konekcije.
        socket.end();
      });
    });

    socket.on('close', () => succeed());
    socket.on('error', (err) => fail(err));
    socket.on('timeout', () => fail(new Error(`Timeout pri komunikaciji sa printerom ${ip}:${port}`)));

    setTimeout(() => {
      if (!settled && socket.connecting) {
        fail(new Error(`Timeout pri konekciji na printer ${ip}:${port}`));
      }
    }, CONNECT_TIMEOUT_MS);
  });
}

/**
 * sendToPrinter sa retry/backoff logikom - koristi se kad je printer
 * privremeno ugasen/offline (npr. zaglavljen papir, restart mreze).
 */
async function sendToPrinterWithRetry(ip, port, data, { attempts = 3, delayMs = 2000 } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      await sendToPrinter(ip, port, data);
      return;
    } catch (err) {
      lastError = err;
      logger.warn(`Pokusaj ${i}/${attempts} stampe na ${ip}:${port} neuspjesan: ${err.message}`);
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, delayMs * i));
      }
    }
  }
  throw lastError;
}

module.exports = { sendToPrinter, sendToPrinterWithRetry };
