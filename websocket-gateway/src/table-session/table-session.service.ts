import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AddCartItemDto, MutateCartItemDto } from './dto/cart-item.dto';
import { CartItem, TableCart } from './interfaces/cart.interface';

/**
 * Cuva i mijenja stanje zajednicke korpe stola u Redisu.
 *
 * Kljucevi:
 *   cart_items:{table_id}    -> Redis HASH, polje = cart_item_id, vrijednost = JSON CartItem
 *   table_session:{table_id} -> SET socket.id-jeva trenutno prikljucenih na taj sto (za dijagnostiku/analitiku)
 *
 * NAMJERNO hash-po-stavci umjesto jednog JSON blob-a pod jednim kljucem:
 * ranija verzija je citala cijelu korpu, mijenjala je u memoriji i pisala
 * nazad ("read-modify-write") - kad dva gosta za istim stolom skoro
 * istovremeno dodaju stavke (realan slucaj za "Multi-User Real-Time Korpa",
 * modul A.2), oba citanja mogu pokupiti stanje PRIJE bilo koje izmjene, i
 * onaj ko upise drugi tiho PREBRISE prvog gosta stavku (izgubljen podatak,
 * bez ikakve greske). HSET na RAZLICITO polje (razlicit cart_item_id) je
 * atoman u Redisu - dva gosta koja dodaju u istom trenutku vise ne mogu
 * jedan drugom prebrisati stavku, jer svaka nova stavka ide na svoj hash
 * field. Ovo je otkriveno i ispravljeno end-to-end testom sa dva prava
 * WebSocket klijenta koji su simulirali istovremeno naruzivanje.
 */
@Injectable()
export class TableSessionService {
  private readonly logger = new Logger(TableSessionService.name);
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = this.config.get<number>('TABLE_SESSION_TTL_SECONDS', 14400);
  }

  private cartItemsKey(tableId: string): string {
    return `cart_items:${tableId}`;
  }

  private participantsKey(tableId: string): string {
    return `table_session:${tableId}`;
  }

  async getCart(tableId: string, restaurantId: string): Promise<TableCart> {
    const raw = await this.redis.hgetall(this.cartItemsKey(tableId));
    const items = Object.values(raw)
      .map((v) => JSON.parse(v) as CartItem)
      .sort((a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime());

    return {
      table_id: tableId,
      restaurant_id: restaurantId,
      items,
      updated_at: new Date().toISOString(),
    };
  }

  async addParticipant(tableId: string, socketId: string): Promise<void> {
    const key = this.participantsKey(tableId);
    await this.redis.sadd(key, socketId);
    await this.redis.expire(key, this.ttlSeconds);
  }

  async removeParticipant(tableId: string, socketId: string): Promise<number> {
    await this.redis.srem(this.participantsKey(tableId), socketId);
    return this.redis.scard(this.participantsKey(tableId));
  }

  /** Atomsko dodavanje - svaka nova stavka ide na svoj hash field, ne moze prebrisati tudju konkurentnu izmjenu. */
  async addItem(dto: AddCartItemDto, restaurantId: string): Promise<TableCart> {
    const item: CartItem = {
      cart_item_id: uuid(),
      menu_item_id: dto.menu_item_id,
      name: dto.name,
      unit_price: dto.unit_price,
      quantity: dto.quantity,
      item_notes: dto.item_notes,
      selected_modifiers: dto.selected_modifiers ?? [],
      added_by: dto.guest_id,
      added_at: new Date().toISOString(),
    };

    const key = this.cartItemsKey(dto.table_id);
    await this.redis.hset(key, item.cart_item_id, JSON.stringify(item));
    await this.redis.expire(key, this.ttlSeconds);

    this.logger.debug(`Gost ${dto.guest_id} dodao "${dto.name}" x${dto.quantity} u korpu stola ${dto.table_id}`);
    return this.getCart(dto.table_id, restaurantId);
  }

  /**
   * Mijenja postojecu stavku (kolicina/napomena). Ovdje read-then-write i
   * dalje postoji, ali svedeno na JEDNO hash polje - dva gosta bi se
   * "sudarili" samo ako oba u istom trenutku mijenjaju BAS ISTU stavku
   * (isti cart_item_id), sto je mnogo uzi i rjedji slucaj od dodavanja
   * novih stavki, i prihvatljivo za MVP obim.
   */
  async mutateItem(dto: MutateCartItemDto, restaurantId: string): Promise<TableCart> {
    const key = this.cartItemsKey(dto.table_id);
    const raw = await this.redis.hget(key, dto.cart_item_id);

    if (!raw) {
      this.logger.warn(`Stavka ${dto.cart_item_id} ne postoji u korpi stola ${dto.table_id} (mozda je vec uklonjena od drugog gosta)`);
      return this.getCart(dto.table_id, restaurantId);
    }

    if (dto.quantity === 0) {
      await this.redis.hdel(key, dto.cart_item_id);
    } else {
      const item = JSON.parse(raw) as CartItem;
      if (dto.quantity !== undefined) item.quantity = dto.quantity;
      if (dto.item_notes !== undefined) item.item_notes = dto.item_notes;
      await this.redis.hset(key, dto.cart_item_id, JSON.stringify(item));
      await this.redis.expire(key, this.ttlSeconds);
    }

    return this.getCart(dto.table_id, restaurantId);
  }

  /** Atomsko uklanjanje - HDEL na jedno polje, bez ikakvog citanja cijele korpe. */
  async removeItem(tableId: string, cartItemId: string, restaurantId: string): Promise<TableCart> {
    await this.redis.hdel(this.cartItemsKey(tableId), cartItemId);
    return this.getCart(tableId, restaurantId);
  }

  async clearCart(tableId: string, restaurantId: string): Promise<void> {
    await this.redis.del(this.cartItemsKey(tableId));
    this.logger.debug(`Korpa stola ${tableId} ispraznjena (narudzba poslata)`);
  }

  cartTotal(cart: TableCart): number {
    return cart.items.reduce((sum, item) => {
      const modifiersTotal = item.selected_modifiers.reduce((s, m) => s + m.price, 0);
      return sum + (item.unit_price + modifiersTotal) * item.quantity;
    }, 0);
  }
}
