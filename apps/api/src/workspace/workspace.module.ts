import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TasksModule } from '../tasks/tasks.module';
import { TwinMarketController, TwinMarketService } from './twin-market.controller';
import { WorkspaceController } from './workspace.controller';
import { MarketHistoryService } from './market-history.service';
import { MarketResearchService } from './market-research.service';
import { WorkspaceService } from './workspace.service';

@Module({
  imports: [DatabaseModule, TasksModule, WorkflowsModule],
  controllers: [WorkspaceController, TwinMarketController],
  providers: [WorkspaceService, TwinMarketService, MarketResearchService, MarketHistoryService],
  exports: [WorkspaceService, TwinMarketService, MarketResearchService],
})
export class WorkspaceModule {}
