import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // preporuceno za GCM
const SALT = 'restoran-saas-encryption-salt-v1'; // fiksna sol je OK ovdje - scrypt samo izvodi 32-bajtni kljuc iz ENCRYPTION_KEY-a, ne cuva lozinke korisnika

/**
 * At-rest enkripcija tajnih polja restorana koja se cuvaju u Postgres-u
 * (Twilio auth token, Stripe secret key, Stripe webhook secret - vidi
 * restaurants.service.ts). NE koristi se za JWT_SECRET i sl. (ti su env
 * varijable, ne DB kolone - enkriptovati ih istim kljucem koji i dalje mora
 * ziviti u istom .env fajlu ne bi nista stvarno zastitilo).
 *
 * ENCRYPTION_KEY (env) moze biti bilo koje duzine - scrypt ga svodi na
 * stabilan 32-bajtni kljuc, pa rotacija na duzu/kraću vrijednost i dalje radi
 * bez posebne migracije formata.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('ENCRYPTION_KEY');
    if (!raw) {
      Logger.warn(
        'ENCRYPTION_KEY nije podešen - koristi se NESIGURAN dev default. Tajni podaci restorana (Twilio/Stripe) NEĆE biti stvarno zaštićeni at-rest. Podesite ENCRYPTION_KEY u produkciji.',
        'EncryptionService',
      );
    }
    this.key = scryptSync(raw ?? 'insecure-dev-encryption-key', SALT, 32);
  }

  /** Vraca "iv:authTag:ciphertext" (sve hex) - jedan string, lako se cuva u postojecoj String kolini bez izmjene seme. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Neispravan format enkriptovanog podatka (očekivano iv:authTag:ciphertext).');
    }
    const [ivHex, authTagHex, dataHex] = parts;
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
