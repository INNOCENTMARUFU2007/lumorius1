import { BullModule, Process, Processor } from '@nestjs/bull';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ExecutiveIntelligenceModule } from '../executive-intelligence/executive-intelligence.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { Module } from '@nestjs/common';
import type { Job } from 'bull';
import { DatabaseModule } from '../database/database.module';
import { LuieModule } from '../luie/luie.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { FounderOsModule } from '../founder-os/founder-os.module';
import { TasksModule } from '../tasks/tasks.module';
import { AGENT_QUEUE, AgentRunsService } from './agent-runs.service';
import { AgentEvidenceService } from './agent-evidence.service';
import { AgentRunConsumer } from './agent-run.consumer';
import { AgentApprovalService } from './agent-approval.service';
import { AgentWorkforceController } from './agent-workforce.controller';

@Processor(AGENT_QUEUE)
class AgentProcessor {
  constructor(private readonly runs: AgentRunsService) {}
  @Process({ name: 'execute', concurrency: 4 })
  execute(job: Job<{ org: string; id: string }>) { return this.runs.execute(job.data.org,job.data.id); }
}

@Module({
  imports: [DatabaseModule,LuieModule,WorkspaceModule,AnalyticsModule,ExecutiveIntelligenceModule,WorkflowsModule,IntegrationsModule,KnowledgeModule,FounderOsModule,TasksModule,
    BullModule.registerQueue({ name: AGENT_QUEUE })],
  controllers: [AgentWorkforceController],
  providers: [AgentRunsService,AgentEvidenceService,AgentApprovalService,AgentProcessor,AgentRunConsumer],
})
export class AgentWorkforceModule {}
