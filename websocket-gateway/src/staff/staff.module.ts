import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StaffGateway } from './staff.gateway';
import { StaffApiClient } from './staff-api-client.service';
import { TableSessionModule } from '../table-session/table-session.module';

@Module({
  imports: [
    TableSessionModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Isti JWT_SECRET kao ../api - ne izdajemo tokene ovdje, samo verifikujemo.
        secret: config.get<string>('JWT_SECRET', 'insecure-dev-secret'),
      }),
    }),
  ],
  providers: [StaffGateway, StaffApiClient],
})
export class StaffModule {}
