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
    return this.prisma.restaurantTable.update({
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
