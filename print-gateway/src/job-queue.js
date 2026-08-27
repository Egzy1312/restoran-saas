'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

/**
 * Jednostavan fajl-baziran queue za print poslove koji nisu odmah uspjeli.
 * Cilj: ako printer padne ili agent restartuje, narudzbe se ne izgube - cim
 * se konekcija/printer oporave, queue se izbrisava (drain-uje) redom.
 *
 * Za produkciju sa vise printera/veci volumen preporuka je SQLite umjesto
 * JSON fajla, ali za MVP obim (desetine narudzbi/sat po restoranu) ovo je
 * dovoljno pouzdano i lako za debug (citljiv JSON na disku).
 */
class JobQueue {
  constructor(filePath = config.queueFile) {
    this.filePath = filePath;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '[]', 'utf8');
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw || '[]');
    } catch (err) {
      logger.error(`Greska pri citanju queue fajla, resetujem na prazan: ${err.message}`);
      return [];
    }
  }

  _write(items) {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf8');
  }

  enqueue(job) {
    const items = this._read();
    items.push({ ...job, _queuedAt: new Date().toISOString(), _attempts: 0 });
    this._write(items);
    logger.warn(`Posao za sto ${job.table_number} dodan u lokalni queue (printer trenutno nedostupan).`);
  }

  list() {
    return this._read();
  }

  remove(predicate) {
    const items = this._read();
    const remaining = items.filter((item) => !predicate(item));
    this._write(remaining);
  }

  isEmpty() {
    return this._read().length === 0;
  }
}

module.exports = JobQueue;
