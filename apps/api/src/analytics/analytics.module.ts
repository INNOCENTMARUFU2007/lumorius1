import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { AnalyticsService } from './analytics.service';

import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
  ],

  controllers: [
    AnalyticsController,
  ],

  providers: [
    AnalyticsService,
    MarketingAnalyticsService,
  ],

  exports: [
    AnalyticsService,
    MarketingAnalyticsService,
  ],
})
export class AnalyticsModule {}