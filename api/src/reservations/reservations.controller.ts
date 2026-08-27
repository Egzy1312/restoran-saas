import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto, UpdateReservationStatusDto } from './dto/create-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.list(user.restaurantId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user.restaurantId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.reservationsService.updateStatus(user.restaurantId, id, dto);
  }

  /** Koristi embeddable web widget na sajtu restorana (modul D.2) - bez auth-a. */
  @Public()
  @Post('public/:slug')
  createPublic(@Param('slug') slug: string, @Body() dto: CreateReservationDto) {
    return this.reservationsService.createPublic(slug, dto);
  }

  /** Interactive Floor Plan Booking (modul D.1) - koji stolovi su slobodni za dati termin/broj gostiju. */
  @Public()
  @Get('public/:slug/availability')
  checkAvailability(
    @Param('slug') slug: string,
    @Query('time') time: string,
    @Query('guest_count') guestCount: string,
  ) {
    return this.reservationsService.checkAvailability(slug, time, Number(guestCount) || 1);
  }
}
