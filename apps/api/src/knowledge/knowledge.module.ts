import { Module } from '@nestjs/common';

import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
  ],

  controllers: [
    KnowledgeController,
  ],

  providers: [
    KnowledgeService,
  ],

  exports: [
    KnowledgeService,
  ],
})
export class KnowledgeModule {}