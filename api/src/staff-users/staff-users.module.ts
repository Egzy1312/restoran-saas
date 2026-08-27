import { Module } from '@nestjs/common';
import { StaffUsersController } from './staff-users.controller';
import { StaffUsersService } from './staff-users.service';

@Module({
  controllers: [StaffUsersController],
  providers: [StaffUsersService],
})
export class StaffUsersModule {}
