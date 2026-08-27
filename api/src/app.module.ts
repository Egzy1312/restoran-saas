import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AuthModule } from './auth/auth.module';
import { TablesModule } from './tables/tables.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { StaffUsersModule } from './staff-users/staff-users.module';
import { BillingModule } from './billing/billing.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { ShopModule } from './shop/shop.module';
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting - globalni default (100 zahtjeva/min po IP-u); rute
    // osjetljive na brute-force (login, refresh) imaju stroze @Throttle()
    // override na sebi (vidi AuthController).
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    RestaurantsModule,
    TablesModule,
    MenuModule,
    OrdersModule,
    ReservationsModule,
    AnalyticsModule,
    StaffUsersModule,
    BillingModule,
    PlatformAdminModule,
    ShopModule,
    UploadsModule,
  ],
  providers: [
    // Throttler prvi - odbija prekomjerne zahtjeve prije nego sto uopste
    // stignu do JWT provjere (i za javne i za privatne rute).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Globalni auth guard - sve rute traze JWT osim onih oznacenih @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
