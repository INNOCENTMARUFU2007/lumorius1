import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowsProcessor } from './workflows.processor';
import { WorkflowsEventsListener } from './workflows.events';
import { WorkflowsScheduler } from './workflows.scheduler';
import { WorkflowDocumentConsumer } from './workflow-document.consumer';
import { DatabaseModule } from '../database/database.module';
import { LuieModule } from '../luie/luie.module';

@Module({
  imports: [
    DatabaseModule,
    LuieModule,
    BullModule.registerQueue({ name: 'workflows' }),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowsProcessor, WorkflowsEventsListener, WorkflowsScheduler, WorkflowDocumentConsumer],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}