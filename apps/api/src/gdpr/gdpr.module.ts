import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';
import { GdprDeletionScheduler } from './gdpr-deletion.scheduler';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../common/email/email.module';

@Module({
  imports: [DatabaseModule, EmailModule, ScheduleModule.forRoot()],
  controllers: [GdprController],
  providers: [GdprService, GdprDeletionScheduler],
})
export class GdprModule {}
