import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { FounderOsService } from '../founder-os/founder-os.service';
import { KnowledgeDecisionsService } from '../knowledge/knowledge-decisions.service';
import { TasksService } from '../tasks/tasks.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';
import { AGENT_RUN_CONSUMER } from './agent-run.consumer';
import { AgentRunsService, Run } from './agent-runs.service';

const reviewMarker = (id: string, version: number) => 'Review version ' + version + ' in AI Advisor: /ai?agentRun=' + id +
  '. This version is fixed. Withdraw it and start a new mission to change the proposal.';

@Injectable()
export class AgentApprovalService {
  constructor(private readonly db: DatabaseService, private readonly runs: AgentRunsService,
    private readonly decisions: KnowledgeDecisionsService, private readonly founder: FounderOsService,
    private readonly tasks: TasksService, private readonly events: LuieEventPublisher) {}

  async submit(actor: JwtPayload, id: string, version: number) {
    const org = actor.organizationId;
    const result = await this.db.transaction(async client => {
      const user = await this.runs.actor(org, actor.sub, client);
      const run = await this.runs.load(user, id, client, true);
      if (run.status !== 'awaiting_approval' || run.artifact_version !== version || !run.artifact?.goals.length) throw new ConflictException('This proposal is no longer awaiting review.');
      await this.runs.verifyExecution(user,run.agent,client);
      await this.runs.assertEvidence(user, run.agent, run.artifact,run.intent,run.market_country,run.mission);
      if (run.decision_id) return { decisionId: run.decision_id, user };
      const decision = await this.decisions.createDecision(org, user.sub, user.role, {
        ownerId: user.sub, title: 'AI Chief of Staff goal proposal', description: reviewMarker(id, version),
        decisionType: 'strategic', expectedOutcome: 'Create the objectives, key results and tasks shown in the reviewed proposal.',
      }, undefined, client);
      const decisionId = String(decision.id);
      await client.query('UPDATE agent_runs SET decision_id=$3,updated_at=now() WHERE organization_id=$1 AND id=$2', [org,id,decisionId]);
      await this.runs.step(client,org,id,'governance','submitted',{ decisionId, version });
      await this.runs.audit(client,run,user.sub,'agent.proposal_submitted',{ decisionId, version });
      return { decisionId, user };
    });
    const current = await this.db.query<{ status: string }>('SELECT status FROM knowledge_decisions WHERE organization_id=$1 AND id=$2', [org,result.decisionId]);
    if (current.rows[0]?.status === 'draft') {
      try { await this.decisions.transitionDecision(result.decisionId,org,result.user.sub,result.user.role,'proposed'); }
      catch (error) {
        const state = await this.db.query<{ status: string }>('SELECT status FROM knowledge_decisions WHERE organization_id=$1 AND id=$2', [org,result.decisionId]);
        if (state.rows[0]?.status !== 'proposed') throw error;
      }
    }
    return { decisionId: result.decisionId };
  }

  async review(actor: JwtPayload, id: string) {
    const user = await this.runs.actor(actor.organizationId, actor.sub);
    const run = (await this.db.query<Run>(`SELECT * FROM agent_runs WHERE organization_id=$1 AND id=$2 AND decision_id IS NOT NULL`, [user.organizationId,id])).rows[0];
    if (!run?.artifact || !run.decision_id) throw new NotFoundException('Proposal not found.');
    await this.decisions.getDecision(run.decision_id,user.organizationId,user.sub,user.role);
    await this.runs.assertEvidence(user,run.agent,run.artifact,run.intent,run.market_country,run.mission);
    await this.db.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ['agent-proposal-view:'+id+':'+user.sub]);
      const seen = await client.query(`SELECT 1 FROM agent_run_steps WHERE organization_id=$1 AND run_id=$2 AND stage='proposal_view' AND details->>'actor'=$3 AND details->>'version'=$4`, [user.organizationId,id,user.sub,String(run.artifact_version)]);
      if (!seen.rowCount) {
        await this.runs.step(client,user.organizationId,id,'proposal_view','succeeded',{ actor:user.sub,version:run.artifact_version });
        await this.runs.audit(client,run,user.sub,'agent.proposal_viewed',{ version:run.artifact_version });
      }
    });
    return { id, artifact: run.artifact, artifactVersion: run.artifact_version, decisionId: run.decision_id, status: run.status };
  }

  async apply(actor: JwtPayload, id: string, version: number) {
    return this.db.transaction(async client => {
      const org = actor.organizationId;
      const user = await this.runs.actor(org,actor.sub,client);
      const run = await this.runs.load(user,id,client,true);
      if (run.artifact_version !== version) throw new ConflictException('The proposal version has changed.');
      if (run.status === 'applied') return run.receipt;
      if (!run.decision_id || !run.artifact?.goals.length || run.status !== 'awaiting_approval') throw new ConflictException('This run has no submitted goal proposal.');
      await this.runs.verifyExecution(user,run.agent,client);
      await this.runs.assertEvidence(user,run.agent,run.artifact,run.intent,run.market_country,run.mission);
      const decision = (await client.query<{ status: string; approved_by_id: string; description: string }>(
        'SELECT status,approved_by_id,description FROM knowledge_decisions WHERE organization_id=$1 AND id=$2 FOR UPDATE',
        [org,run.decision_id])).rows[0];
      if (decision?.status !== 'approved' || !decision.approved_by_id || decision.description !== reviewMarker(id,version)) {
        throw new ConflictException('Decision Intelligence has not approved this proposal version.');
      }
      const reviewer = await this.runs.actor(org,decision.approved_by_id,client);
      const seen = await client.query(`SELECT 1 FROM agent_run_steps WHERE organization_id=$1 AND run_id=$2 AND stage='proposal_view'
        AND details->>'actor'=$3 AND details->>'version'=$4`, [org,id,reviewer.sub,String(version)]);
      if (!seen.rowCount) throw new ForbiddenException('The decision approver must open this proposal in AI Advisor before it can be applied.');
      await this.runs.assertEvidence(reviewer,run.agent,run.artifact,run.intent,run.market_country,run.mission);
      const receipt: { objectiveId: string; taskIds: string[] }[] = [];
      for (const goal of run.artifact.goals) {
        const date = new Date(goal.dueDate + 'T00:00:00Z');
        const quarter = 'Q' + Math.ceil((date.getUTCMonth()+1)/3);
        const objective = await this.founder.createObjective(org,user.sub,{
          title: goal.title, description: goal.rationale + '\nBaseline: not recorded. Verify before measuring progress.',
          quarter, year: date.getUTCFullYear(), dueDate: goal.dueDate, ownerId: user.sub,
        }, client);
        const objectiveId = String(objective.id);
        await this.founder.addKeyResult(org,objectiveId,{ title: goal.metric, metricType: 'number', targetValue: goal.target, startValue: null, unit: goal.unit },client);
        const taskIds: string[] = [];
        for (const title of goal.tasks) {
          const task = await this.tasks.create(org,user.sub,{ title, description: 'Objective: '+objectiveId+' · approval: '+run.decision_id,
            dueDate: goal.dueDate, assigneeId: user.sub },{ userId:user.sub,role:user.role },undefined,client);
          taskIds.push(String(task.id));
        }
        receipt.push({ objectiveId,taskIds });
      }
      await client.query("UPDATE agent_runs SET status='applied',receipt=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",[org,id,JSON.stringify(receipt)]);
      await this.runs.step(client,org,id,'execution','applied',{ objectiveCount:receipt.length });
      await this.runs.audit(client,run,user.sub,'agent.proposal_applied',{ approvedBy:reviewer.sub, decisionId:run.decision_id,version,receipt });
      await this.events.append(client,{ organizationId:org,eventKey:'agent-proposal-applied:'+id,eventType:'agent.proposal_applied',
        aggregateType:'agent_run',aggregateId:id,actorId:user.sub,payload:{ decisionId:run.decision_id,receipt } },[AGENT_RUN_CONSUMER]);
      return receipt;
    });
  }
}
