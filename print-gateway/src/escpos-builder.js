'use strict';

/**
 * Minimalni ESC/POS builder - generise sirove bajtove za termalne printere
 * koji razumiju standardni Epson ESC/POS komandni set (vecina LAN kuhinjskih
 * printera - Epson TM-T20/T88, Xprinter, Bixolon i sl.).
 *
 * Namjerno bez eksterne escpos biblioteke da agent ostane lagan i lako
 * auditabilan - samo iconv-lite za enkodiranje dijakritika (cCzZsSdD) u
 * kodnu stranicu koju printer razumije (npr. CP852).
 */

const iconv = require('iconv-lite');
const config = require('./config');

// ESC/POS kontrolni bajtovi
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]), // ESC @ - reset printera
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_ON: Buffer.from([GS, 0x21, 0x11]), // dupla visina + sirina
  DOUBLE_HEIGHT_ONLY: Buffer.from([GS, 0x21, 0x01]),
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),
  UNDERLINE_ON: Buffer.from([ESC, 0x2d, 0x01]),
  UNDERLINE_OFF: Buffer.from([ESC, 0x2d, 0x00]),
  FEED: (n) => Buffer.from([ESC, 0x64, n]), // ESC d n - n praznih linija
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]), // partial cut
  BUZZER: Buffer.from([ESC, 0x42, 0x03, 0x02]), // ESC B n t - ne podrzavaju svi modeli
  // Odabir kodne stranice - GS ( varira po proizvodjacu, mnogi modeli koriste
  // ESC t n (odabir stranice po tabeli proizvodjaca). 19 je cesto CP852 kod Epson-a.
  CODEPAGE_CP852: Buffer.from([ESC, 0x74, 19]),
};

const CODEPAGE_MAP = {
  CP852: 'cp852',
  CP1250: 'windows1250',
  CP437: 'cp437',
};

class EscPosBuilder {
  constructor({ widthChars = config.widthChars, codepage = config.codepage } = {}) {
    this.widthChars = widthChars;
    this.iconvPage = CODEPAGE_MAP[codepage] || 'cp852';
    this.chunks = [CMD.INIT];
    if (codepage === 'CP852') this.chunks.push(CMD.CODEPAGE_CP852);
  }

  _text(str) {
    // Enkodira BS/HR/SR dijakritike u printer-kompatibilnu kodnu stranicu.
    return iconv.encode(String(str), this.iconvPage);
  }

  raw(buf) {
    this.chunks.push(buf);
    return this;
  }

  line(str = '') {
    this.chunks.push(this._text(str), Buffer.from([0x0a]));
    return this;
  }

  center() {
    this.chunks.push(CMD.ALIGN_CENTER);
    return this;
  }

  left() {
    this.chunks.push(CMD.ALIGN_LEFT);
    return this;
  }

  bold(on = true) {
    this.chunks.push(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
    return this;
  }

  doubleSize(on = true) {
    this.chunks.push(on ? CMD.DOUBLE_ON : CMD.NORMAL_SIZE);
    return this;
  }

  separator(char = '-') {
    this.chunks.push(this._text(char.repeat(this.widthChars)), Buffer.from([0x0a]));
    return this;
  }

  /** Dvije kolone u jednom redu (npr. naziv artikla lijevo, cijena desno). */
  twoColumns(left, right) {
    const leftStr = String(left);
    const rightStr = String(right);
    const space = Math.max(1, this.widthChars - leftStr.length - rightStr.length);
    return this.line(leftStr + ' '.repeat(space) + rightStr);
  }

  feed(n = 3) {
    this.chunks.push(CMD.FEED(n));
    return this;
  }

  buzzer() {
    this.chunks.push(CMD.BUZZER);
    return this;
  }

  cut() {
    this.chunks.push(CMD.CUT_PARTIAL);
    return this;
  }

  build() {
    return Buffer.concat(this.chunks);
  }
}

/**
 * Formatira posao za stampu (order + subset stavki namijenjenih odredjenom
 * printeru - kuhinja ili sank) u ESC/POS bajtove spremne za slanje na 9100.
 *
 * @param {object} job - payload iz `print_job_dispatch` eventa
 * @param {string} job.restaurant_name
 * @param {string} job.table_number
 * @param {string} job.zone_name
 * @param {number} job.order_number
 * @param {'kitchen'|'bar'} job.print_target
 * @param {Array<{name, quantity, unit_price, item_notes, selected_modifiers}>} job.items
 * @param {string} [job.order_notes]
 * @param {string} [job.created_at]
 */
function buildOrderTicket(job) {
  const b = new EscPosBuilder({ codepage: config.codepage, widthChars: config.widthChars });

  const title = job.print_target === 'bar' ? 'ŠANK' : 'KUHINJA';

  b.center().doubleSize(true).bold(true).line(title).doubleSize(false).bold(false);
  b.line(job.restaurant_name || '');
  b.separator('=');

  b.left().bold(true);
  b.line(`Sto: ${job.table_number}${job.zone_name ? '  (' + job.zone_name + ')' : ''}`);
  b.line(`Narudžba #${job.order_number}`);
  b.bold(false);
  b.line(new Date(job.created_at || Date.now()).toLocaleString('bs-BA'));
  b.separator();

  for (const item of job.items || []) {
    b.bold(true).doubleSize(true);
    b.line(`${item.quantity}x ${item.name}`);
    b.doubleSize(false).bold(false);

    if (Array.isArray(item.selected_modifiers) && item.selected_modifiers.length) {
      for (const mod of item.selected_modifiers) {
        b.line(`   + ${mod.name}`);
      }
    }
    if (item.item_notes) {
      b.bold(true).line(`   ** ${item.item_notes}`).bold(false);
    }
  }

  b.separator();

  if (job.order_notes) {
    b.bold(true).line(`Napomena: ${job.order_notes}`).bold(false);
    b.separator();
  }

  b.center().line('--- kraj narudžbe ---');
  b.buzzer();
  b.feed(4);
  b.cut();

  return b.build();
}

module.exports = { EscPosBuilder, buildOrderTicket };
