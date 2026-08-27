import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { ReservationRemindersService } from './reservation-reminders.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [NotificationsService, ReservationRemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
