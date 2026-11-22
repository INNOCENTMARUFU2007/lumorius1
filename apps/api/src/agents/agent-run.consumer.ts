import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import type { LuieDomainEvent,LuieEventConsumer } from '../luie/luie-event.types';

export const AGENT_RUN_CONSUMER='luie.agent-run-notifications';

@Injectable()
export class AgentRunConsumer implements LuieEventConsumer,OnModuleInit {
  readonly name=AGENT_RUN_CONSUMER;
  constructor(private readonly registry:LuieConsumerRegistry,private readonly db:DatabaseService) {}
  onModuleInit() { this.registry.register(this); }
  supports(eventType:string) { return eventType==='agent.run_finished'||eventType==='agent.proposal_applied'; }
  async handle(event:LuieDomainEvent) {
    if (!this.supports(event.eventType) || !event.actorId) return;
    const applied=event.eventType==='agent.proposal_applied';
    const failed=event.payload.status==='failed';
    await this.db.query(`INSERT INTO notifications (id,organization_id,user_id,type,title,message,action_url,data)
      SELECT $1,$2,u.id,'briefing',$4,$5,$6,jsonb_build_object('agentRunId',$7::text)
      FROM users u WHERE u.organization_id=$2 AND u.id=$3 AND u.is_active
      AND u.role::text IN ('owner','admin','manager') ON CONFLICT (id) DO NOTHING`,
      [event.id,event.organizationId,event.actorId,applied?'Approved work created':failed?'Agent mission stopped':'Agent output is ready',
        applied?'Open AI Advisor for the objective and task links.':failed?'Check the run timeline and available data.':'Open AI Advisor to review the result.',
        '/ai?runId='+event.aggregateId,event.aggregateId]);
  }
}
