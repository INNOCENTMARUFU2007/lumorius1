import { EntitlementsService } from '../billing/entitlements';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { WorkflowsService } from '../workflows/workflows.service';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';
import { CashForecastService } from '../executive-intelligence/cash-forecast.service';
import { MarketingAnalyticsService } from '../analytics/marketing-analytics.service';
import { MarketResearchService } from '../workspace/market-research.service';
import { FinancialDigestService } from '../executive-intelligence/financial-digest.service';
import { salesPriority } from './sales-priority';
import { Agent, Evidence, Intent } from './agent-contract';

const compact = (value: unknown, length = 230) => String(value ?? '').slice(0, length);
const dates = (value: unknown) => value ? compact(value, 28) : 'unavailable';
type Row = Record<string, unknown>;

const SOURCE_LINKS: Record<string, (id: string) => string> = {
  document: (id) => '/brain?document=' + id,
  document_passage: (id) => '/brain?document=' + id,
  task: (id) => '/tasks?task=' + id,
  meeting: (id) => '/meetings?meeting=' + id,
  decision: () => '/decisions',
  financial_transaction: () => '/executive-intelligence?view=financials',
};
const SOURCE_LABELS: Record<string, string> = {
  document: 'Document', document_passage: 'Document', task: 'Task', meeting: 'Meeting',
  decision: 'Decision', financial_transaction: 'Financial record',
};

@Injectable()
export class AgentEvidenceService {
  constructor(private readonly db: DatabaseService, private readonly workspace: WorkspaceService, private readonly integrations: IntegrationsService, private readonly marketing: MarketingAnalyticsService, private readonly market: MarketResearchService, private readonly cash: CashForecastService, private readonly knowledge: KnowledgeRetrievalService,private readonly workflows:WorkflowsService, private readonly digest: FinancialDigestService) {}

  /**
   * Documents, decisions, meetings, tasks and financial records matching the mission.
   * Keyword-only so a run's sources can be re-checked deterministically when it finishes.
   */
  private async crossSource(user: JwtPayload, mission: string | undefined, limit: number): Promise<Evidence[]> {
    if (!mission?.trim()) return [];
    const result = await this.knowledge.retrieveUnified({
      organizationId: user.organizationId, userId: user.sub, role: user.role,
      query: mission, limit, lexicalOnly: true, includeFinancialDigest: false,
    });
    return result.sources.map((source) => {
      const type = String(source.sourceType);
      const evidenceId = 'source' in source && source.source ? source.source.evidenceId : null;
      const id = String(source.sourceId ?? '');
      return {
        key: type === 'document' && evidenceId ? 'brain:' + evidenceId : `${type}:${id}`,
        href: (SOURCE_LINKS[type] ?? (() => '/brain'))(id),
        title: `${SOURCE_LABELS[type] ?? 'Source'} · ${compact(source.title, 140)}`,
        detail: compact(source.excerpt, 420),
      };
    });
  }

  /** Sections of the computed financial digest, each citable by its key. */
  private async digestEvidence(user: JwtPayload, only?: string[]): Promise<Evidence[]> {
    if (!(await new EntitlementsService(this.db).forOrganization(user.organizationId)).features.includes('advanced_financial')) return [];
    const digest = await this.digest.build(user.organizationId);
    return (digest?.sections ?? [])
      .filter((section) => !only || only.some((suffix) => section.key.endsWith(suffix)))
      .map((section) => ({ key: section.key, title: section.title, href: '/executive-intelligence?view=financials', detail: section.text.slice(0, 1400) }));
  }

  async collect(agent: Agent, user: JwtPayload, intent?: Intent, marketCountry?: string | null, mission?: string): Promise<Evidence[]> {
    const hasFinance = ['owner', 'admin'].includes(user.role);
    if (agent === 'chief-of-staff' && intent === 'marketing') {
      const [campaigns, research] = await Promise.all([
        hasFinance ? this.marketing.dashboard(user.organizationId,90) : null,
        marketCountry ? this.market.research(marketCountry) : null,
      ]);
      return [
        ...(research?.indicators.flatMap(indicator => indicator.history.length ? [{
          key:'public-market:'+marketCountry+':'+indicator.id, title:research.countryName+' · '+indicator.label, href:indicator.source,
          detail:indicator.history[0].value+indicator.unit+' observed '+indicator.history[0].period+'; retrieved '+indicator.retrievedAt+' ('+indicator.delivery+')',
        }] : []) ?? []),
        ...(campaigns?.items.slice(0,10).map(row => ({
          key:'campaign:'+Buffer.from([row.campaign,row.channel,row.segment,row.currency].join('|')).toString('base64url').slice(0,95),
          title:compact(row.campaign),href:'/analytics',detail:compact(row.channel)+'; period through '+row.through+'; spend '+row.spend+' '+row.currency+
            '; CAC '+(row.cac ?? 'unavailable')+'; ROAS '+(row.roas ?? 'unavailable')+'; attribution: '+(row.attribution_model ?? 'unavailable'),
        })) ?? []),
      ];
    }
    if (agent === 'chief-of-staff') {
      const [{ items, goals, decisions }, related, finance] = await Promise.all([
        this.workspace.briefing(user,intent==='goals'),
        intent!=='goals' ? this.crossSource(user, mission, 8) : [],
        hasFinance && intent!=='goals' ? this.digestEvidence(user, [':totals', ':structure', ':monthly', ':cash', 'finance:targets', 'finance:gaps']) : [],
      ]);
      return [
        ...finance,
        ...related,
        ...items.slice(0, 7).map(item => ({
          key: item.item_key, href: item.source, title: compact(item.title),
          detail: compact(item.reason + ' Priority: ' + item.severity + '; deadline: ' + dates(item.deadline)),
        })),
        ...goals.slice(0, 4).map(row => ({
          key: 'goal:' + row.id, href: '/founder-os#objective-' + row.id, title: compact(row.title),
          detail: 'Status: ' + compact(row.status) + '; progress: ' + compact(row.progress) + '; due: ' + dates(row.due_date),
        })),
        ...(intent==='goals'?[]:decisions.slice(0, 3)).map(row => ({
          key: 'decision-log:' + row.id, href: '/decisions?decision=' + row.id, title: compact(row.title),
          detail: 'Status: ' + compact(row.status) + '; review due: ' + dates(row.review_due_at),
        })),
      ];
    }

    if (agent === 'integration-engineer') {
      const catalog = await this.integrations.listForUser(user);
      return catalog.map(item => ({
        key: 'connector:' + item.id, href: '/integrations', title: item.name,
        detail: compact(item.status + ': ' + item.statusText + ' ' + item.description, 300) +
          (item.requestedScopes?.length ? '; requested scopes: '+compact(item.requestedScopes.join(', '),230) : '') +
          (item.grantedScopes?.length ? '; granted: '+compact(item.grantedScopes.join(', '),170) : ''),
      }));
    }

    if (agent === 'financial-analyst') {
      if (!hasFinance) return [];
      const [finance, related, overview] = await Promise.all([
        this.digestEvidence(user),
        this.crossSource(user, mission, 10),
        this.workspace.briefing(user),
      ]);
      return [
        ...finance,
        ...related,
        ...overview.items.slice(0, 4).map(item => ({
          key: item.item_key, href: item.source, title: compact(item.title),
          detail: compact(item.reason + ' Priority: ' + item.severity + '; deadline: ' + dates(item.deadline)),
        })),
      ];
    }

    if (agent === 'operations-manager') {
      const [overview,runs] = await Promise.all([this.workspace.briefing(user),this.workflows.performance(user.organizationId)]);
      const processes = await Promise.all(runs.slice(0, 2).map(async row=>({row, process:await this.workflows.process(row.id,user.organizationId)})));
      return [...processes.flatMap(({row,process}) => {
        if (!process?.observed) return [];
        return process.bottlenecks.slice(0,2).map(step=>({
          key:'workflow-step:'+row.id+':'+step.step_index+':'+compact(step.step_type,30), href:'/workflows',
          title:compact(row.name,140)+' · '+compact(step.step_type,50),
          detail:'Observed step '+(step.step_index+1)+' in '+step.observed+' sampled executions; '+step.failed+' failures; '+step.retried+
            ' retried; p90 '+(step.p90_seconds ?? 'unavailable')+' s; median preceding wait '+(step.median_wait_seconds ?? 'unavailable')+
            ' s. Overall step coverage: '+process.observed+' of '+process.sampled+' sampled runs.',
        }));
      }), ...runs.slice(0,6).map(row => ({
        key: 'workflow:' + row.id, href: '/workflows', title: compact(row.name),
        detail: 'Last 30 days: ' + row.runs + ' runs, ' + row.failed + ' failed, ' + row.active + ' pending or running; ' + row.retried_steps + ' steps retried; p90 duration ' + (row.p90_seconds===null ? 'unavailable' : Math.round(row.p90_seconds)+' seconds')+'.',
      })), ...overview.items.slice(0, 7).map(item => ({
        key: item.item_key, href: item.source, title: compact(item.title), detail: compact(item.reason),
      }))];
    }

    if (!hasFinance) return [];
    const crm = await this.db.query<Row>(`SELECT i.id,i.document_id,i.provider,i.crm_metadata AS data,i.synced_at
      FROM integration_sync_items i JOIN integration_connections c ON c.organization_id=i.organization_id AND c.provider=i.provider
      JOIN documents d ON d.organization_id=i.organization_id AND d.id=i.document_id
      WHERE i.organization_id=$1 AND c.status='connected' AND i.provider IN ('hubspot','salesforce')
      AND i.crm_authorization_revision=c.authorization_revision AND i.crm_metadata IS NOT NULL
      AND i.crm_metadata->>'closed' IS DISTINCT FROM 'true'
      ORDER BY i.synced_at DESC,i.id LIMIT 50`,[user.organizationId]);
    const now = Date.now();
    if (crm.rows.length) return crm.rows.map(row=>{
      const item=row.data as Record<string,unknown>;
      const priority = salesPriority(item, now);
      return { row, item, priority };
    }).sort((a,b)=>(b.priority.score ?? -1)-(a.priority.score ?? -1)).slice(0,12).map(({ row, item, priority })=>{
      return { key:'crm:'+row.id, title:compact(item.name), href:'/brain?document='+row.document_id,
        detail:compact(row.provider) + ' ' + compact(item.kind) + '; stage: ' + (compact(item.stage) || 'unknown') +
          '; confirmed CRM activity: ' + dates(item.lastActivity) + '; expected close: ' + dates(item.closeDate) +
          '; synced: ' + dates(row.synced_at) + '. Follow-up priority: ' +
          (priority.score === null ? 'not scored' : priority.score+'/100') + ' (' + priority.reasons.join('; ') +
          '). Consent, reply status, and purchase intent were not verified.' };
    });
    const result = await this.db.query<Row>(
      `SELECT id, title, stage, currency, amount, expected_close_date
       FROM executive_pipeline_opportunities WHERE organization_id = $1 AND status = 'open'
       ORDER BY expected_close_date ASC NULLS LAST, id LIMIT 12`, [user.organizationId]);
    return result.rows.map(row => ({
      key: 'pipeline:' + row.id, href: '/executive-intelligence', title: compact(row.title),
      detail: 'Open pipeline; stage: ' + compact(row.stage) + '; value: ' + row.amount + ' ' + row.currency +
        '; expected close: ' + dates(row.expected_close_date) + '. Engagement history and contact consent were not verified.',
    }));
  }
}
