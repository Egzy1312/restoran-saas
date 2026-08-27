import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

class InternalCreateOrderDto extends CreateOrderDto {
  @IsUUID()
  restaurant_id!: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** KDS/konobarski pregled - ?status=pending za novopristigle narudzbe. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.ordersService.list(user.restaurantId, status);
  }

  /** Rucni unos narudzbe od strane konobara (modul C, tacka 2 u specifikaciji). */
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.restaurantId, dto);
  }

  /** Koristi KDS nakon push obavijesti (`new_order_received`) da dovuce puni objekat narudzbe. */
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getOne(user.restaurantId, id);
  }

  /**
   * Racun za sto - "Split the Bill" (modul A.5). Javno, kao i ostale
   * gost-facing rute - gost dokazuje pravo pristupa istim qr_token-om koji
   * je koristio za join_table_session.
   */
  @Public()
  @Get('bill/:tableId')
  getBill(@Param('tableId') tableId: string, @Query('qr_token') qrToken: string) {
    return this.ordersService.getBillForTable(tableId, qrToken);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR')
  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(user.restaurantId, id, dto.status);
  }

  /** Konobar odobrava QR narudžbu koja čeka (modul C.3, opcioni "requireOrderApproval" režim). */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'WAITER')
  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.approveOrder(user.restaurantId, id);
  }

  /** Konobar odbija QR narudžbu koja čeka (npr. artikal više nije dostupan). */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'WAITER')
  @Patch(':id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.rejectOrder(user.restaurantId, id);
  }

  /** Takeaway/Pickup (modul D.3) - javna narudžba za preuzimanje, bez QR koda/stola. */
  @Public()
  @Post('takeaway/:slug')
  createTakeaway(@Param('slug') slug: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.createTakeaway(slug, dto);
  }

  /**
   * "Pametno" najranije vrijeme preuzimanja - raste sa trenutnim brojem
   * aktivnih narudžbi u kuhinji. Gost PWA ovo poziva prije popunjavanja forme
   * da odmah ponudi realan termin umjesto fiksnih +30 min bez obzira na opterećenje.
   */
  @Public()
  @Get('takeaway/:slug/earliest-pickup')
  getEarliestPickup(@Param('slug') slug: string) {
    return this.ordersService.getEarliestPickupTimeForSlug(slug);
  }

  /**
   * Interna ruta - poziva je websocket-gateway servis kad gost posalje
   * `place_order` (gost nema JWT nalog, zato ne prolazi kroz gornju rutu).
   * Zasticena dijeljenim tajnim headerom umjesto JWT-a (vidi InternalServiceGuard).
   */
  @Public()
  @UseGuards(InternalServiceGuard)
  @Post('internal')
  createInternal(@Body() dto: InternalCreateOrderDto) {
    const { restaurant_id, ...rest } = dto;
    return this.ordersService.create(restaurant_id, rest, { isGuestOrder: true });
  }
}
