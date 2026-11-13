import { Module } from '@nestjs/common';

import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

import { DatabaseModule } from '../database/database.module';
import { LuieModule } from '../luie/luie.module';

@Module({
  imports: [
    DatabaseModule,
    LuieModule,
  ],

  controllers: [
    TasksController,
  ],

  providers: [
    TasksService,
  ],

  exports: [
    TasksService,
  ],
})
export class TasksModule {}