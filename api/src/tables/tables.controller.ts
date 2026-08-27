import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { InternalUpdateTableStatusDto } from './dto/internal-update-table-status.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.list(user.restaurantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTableDto) {
    return this.tablesService.create(user.restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'WAITER')
  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(user.restaurantId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tablesService.remove(user.restaurantId, id);
  }

  /**
   * Javna ruta - verifikuje da qr_token odgovara table_id-u. Prevashodno je
   * websocket-gateway pise direktno u bazu (vidi PostgresTableLookupService),
   * ali ova ruta postoji za gost PWA (provjera prije ucitavanja menija) i za
   * lakse rucno testiranje QR tokena bez pristupa bazi.
   */
  @Public()
  @Get('verify')
  async verify(@Query('table_id') tableId: string, @Query('qr_token') qrToken: string) {
    const table = await this.tablesService.verifyToken(tableId, qrToken);
    if (!table) return { valid: false };
    return {
      valid: true,
      table_id: table.id,
      restaurant_id: table.restaurantId,
      table_number: table.tableNumber,
      zone_name: table.zoneName,
    };
  }

  /** Interna ruta - websocket-gateway je poziva kad gost zatraži račun preko `call_waiter`. */
  @Public()
  @UseGuards(InternalServiceGuard)
  @Patch('internal/:id/status')
  updateStatusInternal(@Param('id') id: string, @Body() dto: InternalUpdateTableStatusDto) {
    return this.tablesService.setStatusInternal(id, dto.status);
  }

  /** Gost PWA - razrjesava opaki token iz QR URL-a (`/r/{slug}/t/{token}`) u stvarni table_id. */
  @Public()
  @Get('resolve/:token')
  async resolve(@Param('token') token: string) {
    const table = await this.tablesService.findByToken(token);
    if (!table) return { valid: false };
    return {
      valid: true,
      table_id: table.id,
      qr_token: table.qrCodeToken,
      restaurant_id: table.restaurantId,
      restaurant_slug: table.restaurant.slug,
      table_number: table.tableNumber,
      zone_name: table.zoneName,
    };
  }
}
