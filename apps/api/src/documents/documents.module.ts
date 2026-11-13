import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsProcessor } from './documents.processor';
import { EmbeddingService } from './embedding.service';
import { DocumentRecoveryService } from './document-recovery.service';

import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LuieModule } from '../luie/luie.module';
import { DocumentLegacyEventBridgeConsumer } from './document-legacy-event-bridge.consumer';

@Module({
  imports: [
    DatabaseModule,
    LuieModule,
    BullModule.registerQueue({
      name: 'documents',
    }),
    StorageModule,
    AiModule,
    KnowledgeModule,
  ],
  controllers: [
    DocumentsController,
  ],
  providers: [
    DocumentsService,
    DocumentsProcessor,
    EmbeddingService,
    DocumentRecoveryService,
    DocumentLegacyEventBridgeConsumer,
  ],
  exports: [
    DocumentsService,
    EmbeddingService,
  ],
})
export class DocumentsModule {}