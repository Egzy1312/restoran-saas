import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const REMINDER_WINDOW_START_MIN = 105; // ~1h45min unaprijed
const REMINDER_WINDOW_END_MIN = 135; // ~2h15min unaprijed
// Prozor je namjerno siri od intervala provjere (15 min) - garantuje da svaka
// rezervacija upadne u prozor bar jednom, cak i ako se tacno poklopi sa
// granicom dva uzastopna pokretanja. `reminderSentAt` sprecava duplo slanje.

/** Podsjetnik "2h prije rezervacije" (specifikacija, modul D.4) - provjerava se svakih 15 min. */
@Injectable()
export class ReservationRemindersService {
  private readonly logger = new Logger(ReservationRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/15 * * * *') // svakih 15 min - CronExpression enum nema EVERY_15_MINUTES, samo 5/10/30
  async sendDueReminders() {
    const now = Date.now();
    const windowStart = new Date(now + REMINDER_WINDOW_START_MIN * 60 * 1000);
    const windowEnd = new Date(now + REMINDER_WINDOW_END_MIN * 60 * 1000);

    const dueReservations = await this.prisma.reservation.findMany({
      where: {
        status: 'confirmed',
        reminderSentAt: null,
        reservationTime: { gte: windowStart, lte: windowEnd },
      },
      include: { restaurant: true },
    });

    if (dueReservations.length === 0) return;
    this.logger.log(`Šaljem ${dueReservations.length} podsjetnik(a) za rezervacije u naredna ~2h.`);

    for (const reservation of dueReservations) {
      const time = reservation.reservationTime.toLocaleString('bs-BA', { hour: '2-digit', minute: '2-digit' });
      const body = `Podsjetnik: rezervacija u "${reservation.restaurant.name}" danas u ${time} za ${reservation.guestCount} osoba. Vidimo se!`;

      const result = await this.notifications.sendMessage(reservation.restaurantId, 'sms', reservation.customerPhone, body);

      // Bilježimo pokušaj bez obzira na ishod (i "nije konfigurisano") - ne
      // zelimo da isti restoran bez Twilio-a svakih 15 min iznova pokusava
      // za istu rezervaciju.
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { reminderSentAt: new Date() },
      });

      if (!result.sent) {
        this.logger.warn(`Podsjetnik za rezervaciju ${reservation.id} nije poslan (${result.reason}), ali je označen kao pokušan.`);
      }
    }
  }
}
