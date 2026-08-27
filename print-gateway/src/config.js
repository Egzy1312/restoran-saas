'use strict';

require('dotenv').config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Nedostaje obavezna env varijabla: ${name}`);
  }
  return val;
}

const config = {
  serverWsUrl: required('SERVER_WS_URL'),
  restaurantId: required('RESTAURANT_ID'),
  agentToken: required('AGENT_TOKEN'),

  // Lokalni fallback mapping - server moze poslati azurirani config nakon konekcije
  printers: {
    kitchen: {
      ip: process.env.PRINTER_KITCHEN_IP || '192.168.1.150',
      port: Number(process.env.PRINTER_KITCHEN_PORT || 9100),
    },
    bar: {
      ip: process.env.PRINTER_BAR_IP || '192.168.1.151',
      port: Number(process.env.PRINTER_BAR_PORT || 9100),
    },
  },

  codepage: process.env.PRINTER_CODEPAGE || 'CP852',
  widthChars: Number(process.env.PRINTER_WIDTH_CHARS || 42),

  retryAttempts: Number(process.env.PRINT_RETRY_ATTEMPTS || 3),
  retryDelayMs: Number(process.env.PRINT_RETRY_DELAY_MS || 2000),

  queueFile: process.env.QUEUE_FILE || './data/pending-jobs.json',

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
