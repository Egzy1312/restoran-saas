import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { JoinStaffSessionDto } from './dto/join-staff-session.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ToggleItemAvailabilityDto } from './dto/toggle-item-availability.dto';
import { CloseTableDto } from './dto/close-table.dto';
import { PlaceManualOrderDto } from './dto/place-manual-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { StaffApiClient } from './staff-api-client.service';
import { TableSessionService } from '../table-session/table-session.service';

interface StaffJwtPayload {
  sub: string;
  restaurant_id: string;
  role: string;
  email: string;
}

interface StaffSocketData {
  staffRestaurantId?: string;
  staffRole?: string;
  staffToken?: string;
}

/**
 * WebSocket sloj za osoblje (KDS, konobarski modul). Radi na istom
 * Socket.io serveru kao TableSessionGateway (isti port/namespace), ali sa
 * odvojenim sobama i sopstvenom JWT autentikacijom - gost i osoblje dijele
 * transport, ne i sobe/dozvole.
 *
 * Soba: `restaurant:{restaurant_id}:staff` - u nju TableSessionGateway vec
 * emituje `new_order_received` i `call_waiter` (vidi table-session.gateway.ts).
 * Ovdje se dodaje `join_staff_session` (ulazak u tu sobu) i mutacije koje
 * osoblje pokrece (promjena statusa narudzbe, "86-ing").
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || '*').split(','),
    credentials: true,
  },
})
export class StaffGateway {
  private readonly logger = new Logger(StaffGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly staffApiClient: StaffApiClient,
    private readonly sessionService: TableSessionService,
  ) {}

  /**
   * `join_staff_session` - KDS/konobarski klijent salje JWT dobijen od
   * `POST /api/auth/login`. Verifikacija je lokalna (isti JWT_SECRET kao
   * api servis) - bez dodatnog HTTP poziva pri svakoj konekciji.
   */
  @SubscribeMessage('join_staff_session')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onJoinStaffSession(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinStaffSessionDto) {
    let payload: StaffJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<StaffJwtPayload>(dto.token);
    } catch {
      client.emit('join_staff_session_error', { message: 'Nevažeća ili istekla sesija, prijavite se ponovo.' });
      return;
    }

    const data = client.data as StaffSocketData;
    data.staffRestaurantId = payload.restaurant_id;
    data.staffRole = payload.role;
    data.staffToken = dto.token;

    await client.join(this.staffRoom(payload.restaurant_id));

    client.emit('join_staff_session_ack', {
      restaurant_id: payload.restaurant_id,
      role: payload.role,
    });

    this.logger.log(`Osoblje (${payload.role}) pridruženo restoranu ${payload.restaurant_id} (socket ${client.id})`);
  }

  /**
   * `update_order_status` - KDS mijenja status narudzbe jednim dodirom
   * (Primljeno -> U pripremanju -> Spremno -> Dostavljeno). Poziva API da
   * upise promjenu, pa tek nakon uspjeha broadcast-uje svim ekranima
   * osoblja tog restorana (vise KDS/konobarskih uredjaja ostaje sinhronizovano).
   */
  @SubscribeMessage('update_order_status')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onUpdateOrderStatus(@ConnectedSocket() client: Socket, @MessageBody() dto: UpdateOrderStatusDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.updateOrderStatus(data.staffToken!, dto.order_id, dto.status);
    if (!result.ok || !result.data) {
      client.emit('update_order_status_error', { order_id: dto.order_id, message: result.error });
      return;
    }

    const payload = {
      order_id: dto.order_id,
      new_status: dto.status,
      order_number: result.data.orderNumber,
      changed_at: new Date().toISOString(),
    };

    // Osoblje (drugi KDS/konobarski ekrani ostaju sinhronizovani).
    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('order_status_changed', payload);

    // Gost koji je narucio - dosad je ovaj event stizao SAMO osoblju, gost
    // nije imao nacina da sazna da je kuhar oznacio jelo gotovim osim da
    // fizicki dodje konobar. Dine-in gost je vec u sobi svog stola
    // (join_table_session); takeaway gost prati preko `order:{order_id}`
    // sobe (vidi TableSessionGateway.onTrackOrder) jer nema stol/sobu.
    if (result.data.tableId) {
      this.server.to(`table:${result.data.tableId}`).emit('order_status_changed', payload);
    }
    this.server.to(`order:${dto.order_id}`).emit('order_status_changed', payload);
  }

  /**
   * `approve_order` - konobar odobrava QR narudzbu koja ceka (modul C.3,
   * opcioni `requireOrderApproval` rezim). Tek sad narudzba stize kuhinji -
   * emitujemo `new_order_received` (KDS je do sad NIJE vidio, jer je
   * TableSessionGateway pri kreiranju poslao samo `order_pending_approval`).
   */
  @SubscribeMessage('approve_order')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onApproveOrder(@ConnectedSocket() client: Socket, @MessageBody() dto: ApproveOrderDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.approveOrder(data.staffToken!, dto.order_id);
    if (!result.ok) {
      client.emit('approve_order_error', { order_id: dto.order_id, message: result.error });
      return;
    }

    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('new_order_received', { order_id: dto.order_id });
    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('order_status_changed', {
      order_id: dto.order_id,
      new_status: 'pending',
      changed_at: new Date().toISOString(),
    });
  }

  /** `reject_order` - konobar odbija QR narudzbu koja ceka (npr. artikal vise nije dostupan). Ne ide u kuhinju. */
  @SubscribeMessage('reject_order')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onRejectOrder(@ConnectedSocket() client: Socket, @MessageBody() dto: ApproveOrderDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.rejectOrder(data.staffToken!, dto.order_id);
    if (!result.ok) {
      client.emit('reject_order_error', { order_id: dto.order_id, message: result.error });
      return;
    }

    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('order_status_changed', {
      order_id: dto.order_id,
      new_status: 'cancelled',
      changed_at: new Date().toISOString(),
    });
  }

  /**
   * `toggle_item_availability` - "86-ing" (specifikacija, modul B, tacka 3).
   * Nakon uspjesnog upisa u bazu, obavjestava i osoblje (drugi KDS ekrani) i
   * sve goste trenutno na meniju (`restaurant:{id}:menu` soba, vidi
   * table-session.gateway.ts) - artikal nestaje sa gost menija bez potrebe
   * za rucnim osvjezavanjem stranice.
   */
  @SubscribeMessage('toggle_item_availability')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onToggleItemAvailability(@ConnectedSocket() client: Socket, @MessageBody() dto: ToggleItemAvailabilityDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.updateItemAvailability(data.staffToken!, dto.menu_item_id, dto.is_available);
    if (!result.ok) {
      client.emit('toggle_item_availability_error', { menu_item_id: dto.menu_item_id, message: result.error });
      return;
    }

    const payload = { menu_item_id: dto.menu_item_id, is_available: dto.is_available };
    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('menu_item_availability_changed', payload);
    this.server.to(this.menuRoom(data.staffRestaurantId!)).emit('menu_item_availability_changed', payload);
  }

  /**
   * `place_manual_order` - konobar unosi narudzbu za gosta koji ne koristi
   * QR (modul C.2). Ide preko iste `POST /orders` rute kao i sve ostalo
   * (cijene se preracunavaju iz baze), pa se broadcast-uje isti
   * `new_order_received` koji KDS vec slusa - manuelne i QR narudzbe se
   * ponasaju identicno nizvodno.
   */
  @SubscribeMessage('place_manual_order')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onPlaceManualOrder(@ConnectedSocket() client: Socket, @MessageBody() dto: PlaceManualOrderDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.createOrder(data.staffToken!, {
      table_id: dto.table_id,
      items: dto.items,
      notes: dto.notes,
    });

    if (!result.ok || !result.data) {
      client.emit('place_manual_order_error', { table_id: dto.table_id, message: result.error });
      return;
    }

    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('new_order_received', {
      order_id: result.data.id,
      order_number: result.data.orderNumber,
      table_id: dto.table_id,
      placed_at: new Date().toISOString(),
    });
    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('table_status_changed', {
      table_id: dto.table_id,
      status: 'occupied',
    });
  }

  /**
   * `close_table` - konobar naplati/pospremi sto. Vraca status na 'free' i
   * cisti eventualnu zaostalu korpu u Redisu (da sljedeci gost za tim
   * stolom ne vidi stavke prethodnih gostiju kad skenira QR).
   */
  @SubscribeMessage('close_table')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async onCloseTable(@ConnectedSocket() client: Socket, @MessageBody() dto: CloseTableDto) {
    const data = client.data as StaffSocketData;
    if (!this.assertStaffSession(client, data)) return;

    const result = await this.staffApiClient.updateTableStatus(data.staffToken!, dto.table_id, 'free');
    if (!result.ok) {
      client.emit('close_table_error', { table_id: dto.table_id, message: result.error });
      return;
    }

    await this.sessionService.clearCart(dto.table_id, data.staffRestaurantId!);

    this.server.to(this.staffRoom(data.staffRestaurantId!)).emit('table_status_changed', {
      table_id: dto.table_id,
      status: 'free',
    });
    this.server.to(`table:${dto.table_id}`).emit('cart_updated', { items: [], total: 0 });
  }

  private assertStaffSession(client: Socket, data: StaffSocketData): boolean {
    if (!data.staffRestaurantId || !data.staffToken) {
      client.emit('error', { message: 'Morate prvo pozvati join_staff_session.' });
      return false;
    }
    return true;
  }

  private staffRoom(restaurantId: string): string {
    return `restaurant:${restaurantId}:staff`;
  }

  private menuRoom(restaurantId: string): string {
    return `restaurant:${restaurantId}:menu`;
  }
}
