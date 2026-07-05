import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingsProcessor } from './meetings.processor';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'meetings' }),
    StorageModule,
    AiModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsProcessor],
  exports: [MeetingsService],
})
export class MeetingsModule {}
