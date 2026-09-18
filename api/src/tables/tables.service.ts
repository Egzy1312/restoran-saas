import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: [{ zoneName: 'asc' }, { tableNumber: 'asc' }],
    });
  }

  async create(restaurantId: string, dto: CreateTableDto) {
    return this.prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: dto.table_number,
        zoneName: dto.zone_name ?? 'Glavna Sala',
        capacity: dto.capacity ?? 4,
        posX: dto.pos_x ?? 0,
        posY: dto.pos_y ?? 0,
        // Token nosi dovoljno entropije da se sprijeci pogadjanje (32 bajta -> 43 base64url karaktera)
        qrCodeToken: randomBytes(32).toString('base64url'),
      },
    });
  }

  async update(restaurantId: string, tableId: string, dto: UpdateTableDto) {
    await this.assertOwnership(restaurantId, tableId);

    // Konobar zatvara sto (naplaceno/pospremljeno) - bez ovoga bi eventualne
    // neposluzene narudzbe za taj sto ostale zaglavljene u pending/preparing/
    // ready zauvijek (sto vec izgleda "slobodno" za nove goste, ali KDS i
    // konobar i dalje vide staru narudzbu kao aktivnu). Vracamo (id, novi
    // status) parove da pozivalac (websocket-gateway) moze i uzivo ukloniti
    // ih sa ekrana osoblja, ne samo u bazi.
    let resolvedOrders: { id: string; status: string }[] = [];
    if (dto.status === 'free') {
      resolvedOrders = await this.resolveLingeringOrders(tableId);
    }

    const table = await this.prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        tableNumber: dto.table_number,
        zoneName: dto.zone_name,
        capacity: dto.capacity,
        posX: dto.pos_x,
        posY: dto.pos_y,
        status: dto.status,
      },
    });

    return { ...table, resolvedOrders };
  }

  /**
   * Narudzbe koje nikad nisu odobrene (pending_approval) su bespredmetne kad
   * se sto zatvara - otkazujemo ih. Narudzbe koje SU vec potvrdjene/u kuhinji
   * (pending/preparing/ready) pretpostavljamo da su fizicki poslužene do
   * trenutka kad konobar zatvara sto (naplata implicira da je gost dobio
   * hranu) - oznacavamo ih posluzenim umjesto da ostanu zauvijek "aktivne".
   */
  private async resolveLingeringOrders(tableId: string): Promise<{ id: string; status: string }[]> {
    const lingering = await this.prisma.order.findMany({
      where: { tableId, status: { in: ['pending_approval', 'pending', 'preparing', 'ready'] } },
      select: { id: true, status: true },
    });
    if (lingering.length === 0) return [];

    const cancelledIds = lingering.filter((o) => o.status === 'pending_approval').map((o) => o.id);
    const servedIds = lingering.filter((o) => o.status !== 'pending_approval').map((o) => o.id);

    await this.prisma.$transaction([
      ...(cancelledIds.length ? [this.prisma.order.updateMany({ where: { id: { in: cancelledIds } }, data: { status: 'cancelled' } })] : []),
      ...(servedIds.length ? [this.prisma.order.updateMany({ where: { id: { in: servedIds } }, data: { status: 'served' } })] : []),
    ]);

    return lingering.map((o) => ({ id: o.id, status: cancelledIds.includes(o.id) ? 'cancelled' : 'served' }));
  }

  async remove(restaurantId: string, tableId: string) {
    await this.assertOwnership(restaurantId, tableId);
    await this.prisma.restaurantTable.delete({ where: { id: tableId } });
  }

  /** Javna verifikacija QR tokena - koristi je websocket-gateway (join_table_session) i gost PWA pri ucitavanju menija. */
  async verifyToken(tableId: string, qrToken: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!table || table.qrCodeToken !== qrToken) return null;
    return table;
  }

  /**
   * Interna promjena statusa stola bez staff JWT-a - koristi je
   * websocket-gateway kad gost pošalje `call_waiter { type: 'bill' }`
   * (gost nema nalog, ne moze proci kroz JWT-zasticenu PATCH /tables/:id).
   * Namjerno ne provjerava restaurantId (poziv dolazi od gateway-a koji je
   * vec verifikovao QR token pri `join_table_session`).
   */
  setStatusInternal(tableId: string, status: string) {
    return this.prisma.restaurantTable.update({ where: { id: tableId }, data: { status } });
  }

  /**
   * QR kod nosi samo opaki token u URL-u (`/r/{slug}/t/{token}` - vidi
   * specifikaciju sekcija 2.A), ne stvarni `table_id`. Gost PWA prvo
   * razrjesava token u pravi `table_id` preko ove rute, pa tek onda salje
   * oba preko `join_table_session` (WS gateway i dalje validira par
   * id+token, vidi verifyToken iznad - ovo sprecava da neko pogodi UUID
   * putanju bez validnog tokena).
   */
  async findByToken(qrToken: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrCodeToken: qrToken },
      include: { restaurant: true },
    });
    if (!table || !table.restaurant.isActive) return null;
    return table;
  }

  private async assertOwnership(restaurantId: string, tableId: string) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId } });
    if (!table) throw new NotFoundException('Sto nije pronađen.');
    return table;
  }
}
