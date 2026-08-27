import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Transakcioni email (trenutno samo "zaboravljena lozinka"). Za razliku od
 * Twilio/Stripe (po restoranu, jer je gost/kupac restorana taj koji se
 * kontaktira), SMTP kredencijali su GLOBALNI - ovo je platformska poruka
 * OSOBLJU (bilo kog restorana), ne restoranovim gostima.
 *
 * Bez SMTP_HOST podesenog, ponasanje je isto kao NotificationsService bez
 * Twilio-a: graciozno se preskace (nema greske), a u razvoju se link ispisuje
 * u log da se tok i dalje moze testirati bez pravog mail servera.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<number>('SMTP_PORT', 587) === 465,
        auth: this.config.get<string>('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') }
          : undefined,
      });
    }
  }

  async sendPasswordReset(to: string, fullName: string, resetLink: string): Promise<{ sent: boolean; reason?: string }> {
    const subject = 'Resetovanje lozinke - Restoran SaaS';
    const text = `Zdravo ${fullName},\n\nZatraženo je resetovanje lozinke za vaš nalog. Kliknite na link ispod (važi 1 sat):\n${resetLink}\n\nAko niste vi zatražili ovo, slobodno ignorišite ovaj email.`;
    return this.send(to, subject, text, resetLink);
  }

  /** Ne blokira login/koristenje (vidi AuthService.register) - samo sprecava registraciju na tudji email. */
  async sendEmailVerification(to: string, fullName: string, verifyLink: string): Promise<{ sent: boolean; reason?: string }> {
    const subject = 'Potvrdite svoj email - Restoran SaaS';
    const text = `Zdravo ${fullName},\n\nHvala na registraciji! Potvrdite svoj email klikom na link ispod (važi 24h):\n${verifyLink}\n\nAko niste vi kreirali ovaj nalog, slobodno ignorišite ovaj email.`;
    return this.send(to, subject, text, verifyLink);
  }

  private async send(to: string, subject: string, text: string, fallbackLink: string): Promise<{ sent: boolean; reason?: string }> {
    if (!this.transporter) {
      this.logger.warn(`SMTP nije podešen - link (${to}): ${fallbackLink}`);
      return { sent: false, reason: 'not_configured' };
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM', 'noreply@restoran-saas.test'),
        to,
        subject,
        text,
      });
      return { sent: true };
    } catch (err) {
      this.logger.error(`Slanje emaila nije uspjelo (${to}): ${(err as Error).message}`);
      return { sent: false, reason: (err as Error).message };
    }
  }
}
