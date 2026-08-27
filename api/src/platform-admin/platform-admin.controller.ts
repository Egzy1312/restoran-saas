import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PlatformAdminService } from './platform-admin.service';

/** Sve rute ovdje SAMO za SUPER_ADMIN (platforma) - vidi StaffRole enum, staff-users.service.ts ne dozvoljava restoranima da sami sebi dodijele ovu ulogu. */
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('platform')
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  @Get('restaurants')
  listRestaurants() {
    return this.platformAdmin.listRestaurants();
  }

  @Get('stats')
  stats() {
    return this.platformAdmin.platformStats();
  }

  @Get('audit-log')
  auditLog() {
    return this.platformAdmin.listAuditLog();
  }

  @Patch('restaurants/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.platformAdmin.setActive(id, false, { id: user.userId, email: user.email });
  }

  @Patch('restaurants/:id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.platformAdmin.setActive(id, true, { id: user.userId, email: user.email });
  }
}
