import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsProcessor } from './documents.processor';
import { EmbeddingService } from './embedding.service';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'documents' }),
    StorageModule,
    AiModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsProcessor, EmbeddingService],
  exports: [DocumentsService, EmbeddingService],
})
export class DocumentsModule {}
