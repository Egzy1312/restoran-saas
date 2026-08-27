import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReservationDto, UpdateReservationStatusDto } from './dto/create-reservation.dto';

/** Fiksno trajanje slota (specifikacija, modul D.1: "rezervacija traje 1.5h ili 2h") - nema po-restoranu podesavanja u MVP obimu. */
const RESERVATION_DURATION_MINUTES = 120;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.reservation.findMany({
      where: { restaurantId },
      orderBy: { reservationTime: 'asc' },
      include: { table: true },
    });
  }

  /**
   * SMS potvrda se salje "fire-and-forget" (ne ceka se odgovor) - gost ne
   * treba cekati Twilio round-trip da vidi da je rezervacija primljena, i
   * neuspjeh slanja (npr. restoran nije podesio Twilio) ne smije srusiti
   * samu rezervaciju.
   */
  async create(restaurantId: string, dto: CreateReservationDto) {
    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId,
        tableId: dto.table_id,
        customerName: dto.customer_name,
        customerPhone: dto.customer_phone,
        customerEmail: dto.customer_email,
        reservationTime: new Date(dto.reservation_time),
        guestCount: dto.guest_count,
        specialRequests: dto.special_requests,
      },
      include: { restaurant: true },
    });

    const time = reservation.reservationTime.toLocaleString('bs-BA', { dateStyle: 'medium', timeStyle: 'short' });
    const body = `Potvrda rezervacije u "${reservation.restaurant.name}" za ${time}, ${reservation.guestCount} osoba. Vidimo se!`;

    this.notifications
      .sendMessage(restaurantId, 'sms', reservation.customerPhone, body)
      .then((result) =>
        result.sent
          ? this.prisma.reservation.update({ where: { id: reservation.id }, data: { confirmationSentAt: new Date() } })
          : undefined,
      )
      .catch(() => undefined);

    const { restaurant: _restaurant, ...rest } = reservation;
    return rest;
  }

  /**
   * Interactive Floor Plan Booking (modul D.1) - koji stolovi su slobodni za
   * dati termin i broj gostiju. Dva stola se "sudaraju" ako im se
   * `reservation_time` razlikuje za manje od trajanja slota (isti fiksni
   * RESERVATION_DURATION_MINUTES za obje rezervacije, pa je preklapanje
   * ekvivalentno |t1 - t2| < trajanje).
   */
  async checkAvailability(restaurantSlug: string, timeIso: string, guestCount: number) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    const requestedTime = new Date(timeIso);
    if (Number.isNaN(requestedTime.getTime())) throw new BadRequestException('Nevažeće vrijeme.');

    const durationMs = RESERVATION_DURATION_MINUTES * 60 * 1000;
    const windowStart = new Date(requestedTime.getTime() - durationMs);
    const windowEnd = new Date(requestedTime.getTime() + durationMs);

    const [tables, overlapping] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: { restaurantId: restaurant.id, capacity: { gte: guestCount } },
        orderBy: [{ zoneName: 'asc' }, { tableNumber: 'asc' }],
      }),
      this.prisma.reservation.findMany({
        where: {
          restaurantId: restaurant.id,
          status: 'confirmed',
          tableId: { not: null },
          reservationTime: { gt: windowStart, lt: windowEnd },
        },
        select: { tableId: true },
      }),
    ]);

    const bookedTableIds = new Set(overlapping.map((r) => r.tableId));

    return tables
      .filter((t) => !bookedTableIds.has(t.id))
      .map((t) => ({
        table_id: t.id,
        table_number: t.tableNumber,
        zone_name: t.zoneName,
        capacity: t.capacity,
      }));
  }

  /** Javna rezervacija sa embeddable web widget-a (modul D.2 u specifikaciji) - identifikuje restoran po slug-u iz URL-a. */
  async createPublic(restaurantSlug: string, dto: CreateReservationDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    if (dto.table_id) {
      const available = await this.checkAvailability(restaurantSlug, dto.reservation_time, dto.guest_count);
      if (!available.some((t) => t.table_id === dto.table_id)) {
        throw new BadRequestException('Odabrani sto više nije dostupan za taj termin - izaberite drugi.');
      }
    }

    return this.create(restaurant.id, dto);
  }

  async updateStatus(restaurantId: string, reservationId: string, dto: UpdateReservationStatusDto) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
    });
    if (!reservation) throw new NotFoundException('Rezervacija nije pronađena.');

    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: dto.status },
    });
  }
}
