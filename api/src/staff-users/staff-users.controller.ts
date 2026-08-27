import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { StaffUsersService } from './staff-users.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';

/** Upravljanje nalozima osoblja (konobar/kuhinja/šank/menadžer) - samo ADMIN/MANAGER. Ranije samo kroz seed skriptu. */
@UseGuards(RolesGuard)
@Roles('ADMIN', 'MANAGER')
@Controller('staff')
export class StaffUsersController {
  constructor(private readonly staffUsersService: StaffUsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.staffUsersService.list(user.restaurantId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffUserDto) {
    return this.staffUsersService.create(user.restaurantId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateStaffUserDto) {
    return this.staffUsersService.update(user.restaurantId, id, user.userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staffUsersService.remove(user.restaurantId, id, user.userId);
  }
}
