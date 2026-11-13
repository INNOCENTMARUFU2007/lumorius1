import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingsProcessor } from './meetings.processor';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { TasksModule } from '../tasks/tasks.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MeetingReviewService } from './meeting-review.service';
import { MeetingCrossMeetingIntelligenceService } from './meeting-cross-meeting-intelligence.service';
import { LuieModule } from '../luie/luie.module';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: 'meetings' }),
    StorageModule,
    AiModule,
    TasksModule,
    KnowledgeModule,
    LuieModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingsProcessor, MeetingIntelligenceService, MeetingReviewService, MeetingCrossMeetingIntelligenceService],
  exports: [MeetingsService, MeetingIntelligenceService, MeetingReviewService],
})
export class MeetingsModule {}