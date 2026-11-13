import { Module, forwardRef } from '@nestjs/common';

import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeDocumentConsumer } from './knowledge-document.consumer';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeAnalyticsService } from './knowledge-analytics.service';
import { KnowledgeClaimsService } from './knowledge-claims.service';
import { KnowledgeConflictsService } from './knowledge-conflicts.service';
import { KnowledgeDecisionsService } from './knowledge-decisions.service';
import { KnowledgeDecisionsController } from './knowledge-decisions.controller';

import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';
import { LuieModule } from '../luie/luie.module';
import { ExecutiveIntelligenceModule } from '../executive-intelligence/executive-intelligence.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AiModule),
    LuieModule,
    ExecutiveIntelligenceModule,
  ],
  controllers: [
    KnowledgeController,
    KnowledgeDecisionsController,
  ],
    providers: [
    KnowledgeService,
    KnowledgeDocumentConsumer,
    KnowledgeExtractionService,
    KnowledgeRetrievalService,
    KnowledgeAnalyticsService,
    KnowledgeClaimsService,
    KnowledgeConflictsService,
    KnowledgeDecisionsService,
  ],
  exports: [
    KnowledgeService,
    KnowledgeRetrievalService,
    KnowledgeAnalyticsService,
    KnowledgeDecisionsService,
  ],
})
export class KnowledgeModule {}