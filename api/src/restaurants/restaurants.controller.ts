import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  /** Koristi admin panel (npr. slug za generisanje QR linkova, ime za nav) - bilo koji ulogovani staff svog restorana. */
  @Get('me')
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurantsService.getOwn(user.restaurantId);
  }

  /** "Postavke" ekran u admin panelu - printeri, anti-fraud, odobravanje narudžbi, kredencijali (Twilio/Stripe) po restoranu. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch('me')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRestaurantSettingsDto) {
    return this.restaurantsService.updateSettings(user.restaurantId, dto);
  }
}
