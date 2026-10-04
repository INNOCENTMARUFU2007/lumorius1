import { Module } from '@nestjs/common';

import { BullModule } from '@nestjs/bull';

import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    DatabaseModule,

    BullModule.registerQueue({
      name: 'workflows',
    }),
  ],

  controllers: [
    WorkflowsController,
  ],

  providers: [
    WorkflowsService,
  ],

  exports: [
    WorkflowsService,
  ],
})
export class WorkflowsModule {}