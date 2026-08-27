import { Injectable, Logger } from '@nestjs/common';
import twilio from 'twilio';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';

export type NotificationChannel = 'sms' | 'whatsapp';

/**
 * SMS/WhatsApp podsjetnici za rezervacije (specifikacija, modul D.4).
 * Kredencijali su PO RESTORANU (unijeti kroz admin "Postavke" ekran, ne
 * globalna .env varijabla - vidi RestaurantsService/settings), jer je ovo
 * multi-tenant sistem i svaki vlasnik restorana koristi svoj Twilio nalog.
 *
 * Ako restoran nije podesio Twilio, ovo je NAMJERNO tih no-op (samo log
 * upozorenje) - slanje poruke nikad ne smije srusiti tok koji ga je pozvao
 * (rezervacija se i dalje uspjesno kreira i bez SMS-a).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async sendMessage(
    restaurantId: string,
    channel: NotificationChannel,
    to: string,
    body: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });

    if (!restaurant?.twilioAccountSid || !restaurant.twilioAuthToken || !restaurant.twilioFromNumber) {
      this.logger.warn(
        `Restoran ${restaurantId} nema podešen Twilio (vidi admin "Postavke") - poruka nije poslana, samo zabilježeno.`,
      );
      return { sent: false, reason: 'not_configured' };
    }

    try {
      const authToken = this.encryption.decrypt(restaurant.twilioAuthToken);
      const client = twilio(restaurant.twilioAccountSid, authToken);
      const from =
        channel === 'whatsapp' && !restaurant.twilioFromNumber.startsWith('whatsapp:')
          ? `whatsapp:${restaurant.twilioFromNumber}`
          : restaurant.twilioFromNumber;
      const toFormatted = channel === 'whatsapp' ? `whatsapp:${to}` : to;

      await client.messages.create({ body, from, to: toFormatted });
      this.logger.log(`${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} poslan restoranu ${restaurantId} -> ${to}`);
      return { sent: true };
    } catch (err) {
      this.logger.error(`Slanje poruke nije uspjelo (restoran ${restaurantId}): ${(err as Error).message}`);
      return { sent: false, reason: (err as Error).message };
    }
  }
}
