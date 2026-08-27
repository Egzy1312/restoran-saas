import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TableSessionService } from './table-session.service';
import { JoinTableSessionDto } from './dto/join-table-session.dto';
import { AddCartItemDto, MutateCartItemDto } from './dto/cart-item.dto';
import { CallWaiterDto } from './dto/call-waiter.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { distanceMeters, normalizeIp } from './geo.util';
import { TABLE_LOOKUP_PORT, TableLookupPort } from './table-lookup.port';
import { OrdersApiClient } from './orders-api-client.service';
import { TablesStatusClient } from './tables-status-client.service';

interface SocketData {
  table_id?: string;
  restaurant_id?: string;
  guest_id?: string;
}

/**
 * WebSocket Gateway - upravlja sobnim sesijama stolova i sinhronizacijom
 * zajednicke korpe u realnom vremenu (vidi tabelu dogadjaja u specifikaciji,
 * sekcija 5).
 *
 * Sobe (Socket.io rooms):
 *   `table:{table_id}`                 - svi gosti trenutno za tim stolom
 *   `restaurant:{restaurant_id}:staff` - konobari/KDS tog restorana (za call_waiter, new_order_received)
 *
 * Namespace ostaje default ('/') da bi PWA klijent mogao koristiti isti
 * socket i za gost-dogadjaje; u produkciji je razumno odvojiti staff/KDS na
 * poseban namespace sa JWT auth guard-om (ovdje izostavljeno radi fokusa na
 * zadate dogadjaje).
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || '*').split(','),
    credentials: true,
  },
})
export class TableSessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TableSessionGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessionService: TableSessionService,
    private readonly ordersApiClient: OrdersApiClient,
    private readonly tablesStatusClient: TablesStatusClient,
    @Inject(TABLE_LOOKUP_PORT) private readonly tableLookup: TableLookupPort,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Klijent povezan: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as SocketData;
    if (!data.table_id) return;

    const remaining = await this.sessionService.removeParticipant(data.table_id, client.id);
    this.logger.debug(`Klijent ${client.id} napustio sto ${data.table_id} (preostalo ucesnika: ${remaining})`);

    // Ne brisemo korpu kad soba ostane prazna - gosti cesto nakratko izgube
    // konekciju (prelazak app/browser u pozadinu na mobitelu). Cisti se preko
    // TTL-a u Redisu ili eksplicitno kad konobar zatvori sto.
  }

  /**
   * `join_table_session` - klijent (gost) se prikljucuje sesiji stola nakon
   * skeniranja QR koda. Server verifikuje qr_token protiv baze, ubacuje
   * socket u sobu `table:{table_id}` i vraca trenutno stanje korpe.
   */
  @SubscribeMessage('join_table_session')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onJoinTableSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinTableSessionDto,
  ) {
    const table = await this.tableLookup.verifyTableToken(dto.table_id, dto.qr_token);

    if (!table) {
      this.logger.warn(`Neuspjela verifikacija QR tokena za sto ${dto.table_id} (klijent ${client.id})`);
      client.emit('join_table_session_error', {
        message: 'Nevažeći QR kod ili sto više nije aktivan.',
      });
      return;
    }

    // Anti-fraud (modul A.6) - obje provjere su OPCIONE, aktivne samo ako je
    // restoran nesto podesio u admin "Postavke" ekranu. Sprecava naruzivanje
    // sa slike QR koda poslane van restorana.
    if (table.geofence_radius_meters && table.restaurant_latitude !== null && table.restaurant_longitude !== null) {
      if (dto.latitude === undefined || dto.longitude === undefined) {
        client.emit('join_table_session_error', {
          message: 'Ovaj restoran zahtijeva pristup lokaciji da potvrdi da ste za stolom.',
        });
        return;
      }
      const distance = distanceMeters(dto.latitude, dto.longitude, table.restaurant_latitude, table.restaurant_longitude);
      if (distance > table.geofence_radius_meters) {
        this.logger.warn(`Gost ${dto.guest_id} odbijen - van geofence radijusa (${Math.round(distance)}m od restorana ${table.restaurant_id})`);
        client.emit('join_table_session_error', {
          message: 'Izgleda da niste u restoranu - narudžba je moguća samo dok ste fizički za stolom.',
        });
        return;
      }
    }

    if (table.allowed_ip) {
      const clientIp = normalizeIp(client.handshake.address);
      if (clientIp !== table.allowed_ip) {
        this.logger.warn(`Gost ${dto.guest_id} odbijen - IP ${clientIp} ne odgovara restoranovoj mreži (${table.allowed_ip})`);
        client.emit('join_table_session_error', {
          message: 'Narudžba je moguća samo preko Wi-Fi mreže restorana.',
        });
        return;
      }
    }

    const data = client.data as SocketData;
    data.table_id = table.table_id;
    data.restaurant_id = table.restaurant_id;
    data.guest_id = dto.guest_id;

    await client.join(this.tableRoom(table.table_id));
    // Restoran-siroka soba (ne po stolu) - ovdje StaffGateway objavljuje
    // `menu_item_availability_changed` ("86-ing") da gost odmah vidi kad
    // artikal postane nedostupan, bez potrebe da osvjezi stranicu.
    await client.join(this.menuRoom(table.restaurant_id));
    await this.sessionService.addParticipant(table.table_id, client.id);

    const cart = await this.sessionService.getCart(table.table_id, table.restaurant_id);

    client.emit('join_table_session_ack', {
      table_id: table.table_id,
      table_number: table.table_number,
      zone_name: table.zone_name,
      restaurant_id: table.restaurant_id,
    });

    // Novopristigli gost odmah dobija trenutno stanje zajednicke korpe.
    client.emit('cart_updated', {
      items: cart.items,
      total: this.sessionService.cartTotal(cart),
    });

    this.logger.log(`Gost ${dto.guest_id} pridruzen stolu ${table.table_number} (${table.table_id})`);
  }

  @SubscribeMessage('add_cart_item')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onAddCartItem(@ConnectedSocket() client: Socket, @MessageBody() dto: AddCartItemDto) {
    if (!this.assertInSession(client, dto.table_id)) return;

    const restaurantId = (client.data as SocketData).restaurant_id!;
    const cart = await this.sessionService.addItem(dto, restaurantId);
    this.broadcastCart(dto.table_id, cart);
  }

  @SubscribeMessage('update_cart_item')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onUpdateCartItem(@ConnectedSocket() client: Socket, @MessageBody() dto: MutateCartItemDto) {
    if (!this.assertInSession(client, dto.table_id)) return;

    const restaurantId = (client.data as SocketData).restaurant_id!;
    const cart = await this.sessionService.mutateItem(dto, restaurantId);
    this.broadcastCart(dto.table_id, cart);
  }

  @SubscribeMessage('remove_cart_item')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onRemoveCartItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { table_id: string; cart_item_id: string },
  ) {
    if (!this.assertInSession(client, dto.table_id)) return;

    const restaurantId = (client.data as SocketData).restaurant_id!;
    const cart = await this.sessionService.removeItem(dto.table_id, dto.cart_item_id, restaurantId);
    this.broadcastCart(dto.table_id, cart);
  }

  /**
   * `call_waiter` - poziv konobara ili zahtjev za racun. Prosledjuje se
   * sobi osoblja tog restorana (KDS/konobarski moduli slusaju ovaj event
   * da bi zatreperili odgovarajuci sto na tlocrtu, vidi modul C u specifikaciji).
   */
  @SubscribeMessage('call_waiter')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onCallWaiter(@ConnectedSocket() client: Socket, @MessageBody() dto: CallWaiterDto) {
    if (!this.assertInSession(client, dto.table_id)) return;

    const data = client.data as SocketData;
    this.server.to(this.staffRoom(data.restaurant_id!)).emit('call_waiter', {
      table_id: dto.table_id,
      type: dto.type,
      payment_method: dto.payment_method,
      requested_at: new Date().toISOString(),
    });

    // "Zatraži račun" perzistira status stola (za razliku od "Pozovi konobara"
    // koje je samo trenutna notifikacija) - konobarski tlocrt ostaje tacan
    // i ako konobar u tom trenutku nije gledao ekran.
    if (dto.type === 'bill') {
      const ok = await this.tablesStatusClient.setStatus(dto.table_id, 'bill_requested');
      if (ok) {
        this.server.to(this.staffRoom(data.restaurant_id!)).emit('table_status_changed', {
          table_id: dto.table_id,
          status: 'bill_requested',
        });
      }
    }

    this.logger.log(`Sto ${dto.table_id}: zahtjev '${dto.type}'`);
  }

  /**
   * `place_order` - pretvara trenutnu zajednicku korpu u narudzbu. Stvarna
   * perzistencija (Postgres `orders`/`order_items`, rekalkulacija cijena,
   * pokretanje Smart Routing print toka) desava se u glavnom API servisu -
   * ovaj handler samo poziva `OrdersApiClient.placeOrder()` i ceka rezultat
   * prije nego sto obavijesti osoblje i isprazni korpu, da se izbjegne
   * gubitak narudzbe ako upis u bazu ne uspije (npr. API trenutno nedostupan).
   */
  @SubscribeMessage('place_order')
  async onPlaceOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { table_id: string; notes?: string },
  ) {
    if (!this.assertInSession(client, dto.table_id)) return;

    const data = client.data as SocketData;
    const cart = await this.sessionService.getCart(dto.table_id, data.restaurant_id!);

    if (!cart.items.length) {
      client.emit('place_order_error', { message: 'Korpa je prazna.' });
      return;
    }

    const result = await this.ordersApiClient.placeOrder({
      restaurantId: data.restaurant_id!,
      tableId: dto.table_id,
      items: cart.items,
      notes: dto.notes,
      placedBy: data.guest_id!,
    });

    if (!result.ok) {
      client.emit('place_order_error', { message: result.error ?? 'Narudžba nije uspjela, pokušajte ponovo.' });
      return;
    }

    const orderPayload = {
      order_id: result.order_id,
      order_number: result.order_number,
      table_id: dto.table_id,
      items: cart.items,
      total: this.sessionService.cartTotal(cart),
      notes: dto.notes,
      placed_by: data.guest_id,
      placed_at: new Date().toISOString(),
    };

    // Ako restoran ima ukljucen requireOrderApproval (modul C.3), narudzba
    // JOS NE ide kuhinji - KDS reaguje samo na `new_order_received`, pa mu
    // ovu narudzbu namjerno ne saljemo dok je konobar ne odobri preko
    // `approve_order` (vidi staff.gateway.ts). Konobarski ekran umjesto toga
    // dobija poseban event da je prikaze u "Za odobrenje" sekciji.
    if (result.status === 'pending_approval') {
      this.server.to(this.staffRoom(data.restaurant_id!)).emit('order_pending_approval', orderPayload);
    } else {
      this.server.to(this.staffRoom(data.restaurant_id!)).emit('new_order_received', orderPayload);
    }
    // API je (unutar OrdersService.create) sto vec prebacio u 'occupied' ako
    // je bio 'free'/'reserved' - ovdje samo obavjestavamo konobarski tlocrt
    // uzivo, bez dodatnog citanja iz baze.
    this.server.to(this.staffRoom(data.restaurant_id!)).emit('table_status_changed', {
      table_id: dto.table_id,
      status: 'occupied',
    });
    this.server.to(this.tableRoom(dto.table_id)).emit('order_placed', {
      order_id: result.order_id,
      order_number: result.order_number,
    });

    await this.sessionService.clearCart(dto.table_id, data.restaurant_id!);
    this.broadcastCart(dto.table_id, await this.sessionService.getCart(dto.table_id, data.restaurant_id!));
  }

  /**
   * `track_order` - koristi gost koji NEMA sto (Takeaway/Pickup, modul D.3).
   * Nakon `POST /api/orders/takeaway/:slug` klijent dobije `order_id` i
   * poveze se na ovaj event da uzivo prati status ("U pripremi" -> "Spremno
   * za preuzimanje") bez potrebe za pollingom. Namjerno bez dodatne
   * verifikacije osim samog `order_id`-a (nasumican UUID) - isti nivo
   * povjerenja kao qr_token pristup ostatku gost-facing API-ja.
   */
  @SubscribeMessage('track_order')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onTrackOrder(@ConnectedSocket() client: Socket, @MessageBody() dto: TrackOrderDto) {
    await client.join(`order:${dto.order_id}`);
  }

  // --- Interno ---

  private tableRoom(tableId: string): string {
    return `table:${tableId}`;
  }

  private staffRoom(restaurantId: string): string {
    return `restaurant:${restaurantId}:staff`;
  }

  private menuRoom(restaurantId: string): string {
    return `restaurant:${restaurantId}:menu`;
  }

  private assertInSession(client: Socket, tableId: string): boolean {
    const data = client.data as SocketData;
    if (data.table_id !== tableId) {
      client.emit('error', {
        message: 'Morate prvo pozvati join_table_session za ovaj sto.',
      });
      return false;
    }
    return true;
  }

  private broadcastCart(tableId: string, cart: Awaited<ReturnType<TableSessionService['getCart']>>) {
    this.server.to(this.tableRoom(tableId)).emit('cart_updated', {
      items: cart.items,
      total: this.sessionService.cartTotal(cart),
    });
  }
}
