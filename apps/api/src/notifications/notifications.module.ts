import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEmailService } from './notification-email.service';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEmailService],
  exports: [NotificationsService, NotificationEmailService],
})
export class NotificationsModule {}
