import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BRIEFING_ITEM_KEY, briefingLookback } from './briefing-key';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { DatabaseService } from '../database/database.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { TasksService } from '../tasks/tasks.service';
import { BRIEFING_ITEMS } from './briefing.query';

type Schedule = { cadence: 'off' | 'daily' | 'weekly' | 'monthly'; hourUtc: number; weekday: number };
type Item = {
  id: string; kind: string; item_key: string; title: string; reason: string; next_step: string;
  severity: number; deadline: Date | null; team_id: string | null; owner_name: string | null;
  disposition: 'useful' | 'dismissed' | null;
};
const sourceLinks: Record<string, (id: string) => string> = {
  commitment: (id) => '/tasks?task=' + id,
  project: (id) => '/tasks?project=' + id,
  decision: (id) => '/decisions?decision=' + id,
  approval: (id) => '/decisions?decision=' + id,
  meeting: (id) => '/meetings/' + id,
  objective: (id) => '/founder-os#objective-' + id,
  kpi: () => '/founder-os#recorded-kpis',
  renewal: () => '/executive-intelligence?view=financials',
  financial_approval: (id) => '/executive-intelligence?view=sources#financial-' + id,
};

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService, private readonly tasks: TasksService, private readonly workflows: WorkflowsService) {}

  private scope(user: JwtPayload) {
    const admin = ['owner', 'admin'].includes(user.role);
    return [user.organizationId, user.sub, admin, admin || user.role === 'manager'] as const;
  }

  private async preferences(user: JwtPayload) {
    const result = await this.db.query<Schedule & { nextDeliveryAt: Date; lastDeliveredAt: Date }>(
      `SELECT cadence, hour_utc AS "hourUtc", weekday,
              next_delivery_at AS "nextDeliveryAt", last_delivered_at AS "lastDeliveredAt"
       FROM briefing_preferences WHERE organization_id = $1 AND user_id = $2`,
      [user.organizationId, user.sub],
    );
    return result.rows[0] ?? { cadence: 'off', hourUtc: 8, weekday: 1, nextDeliveryAt: null, lastDeliveredAt: null };
  }

  async briefing(user: JwtPayload, sharedGoalsOnly = false) {
    const schedule = await this.preferences(user);
    const scope = this.scope(user);
    const [items, goals, decisions, workflows, workflowRequests] = await Promise.all([
      this.db.query<Item>(
        BRIEFING_ITEMS + `SELECT * FROM ranked WHERE item_rank <= 12
          ${sharedGoalsOnly ? "AND team_id IS NULL AND kind IN ('commitment','project','objective')" : ''}
          ORDER BY severity, deadline NULLS LAST, activity DESC, id`,
        [...scope, briefingLookback(schedule.cadence)],
      ),
      this.db.query(
        `SELECT o.id, o.title, o.status, o.progress, o.due_date, u.name AS owner_name,
           indicators.items AS indicators, history.items AS history
         FROM objectives o
         LEFT JOIN users u ON u.id = o.owner_id AND u.organization_id = o.organization_id
         CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(k), '[]') AS items FROM (
           SELECT id, title, current_value, target_value, unit, start_value,
             CASE WHEN start_value IS NULL OR current_value IS NULL THEN NULL ELSE progress END AS progress
           FROM key_results WHERE objective_id = o.id ORDER BY created_at LIMIT 10
         ) k) indicators
         CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(h ORDER BY h.recorded_at, h.id), '[]') AS items FROM (
           SELECT id, recorded_at, progress, status FROM objective_progress_events
           WHERE objective_id = o.id ORDER BY recorded_at DESC, id DESC LIMIT 16
         ) h) history
         WHERE o.organization_id = $1 AND ($3 OR o.owner_id = $2)
         ORDER BY CASE o.status WHEN 'behind' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
                  o.updated_at DESC, o.id LIMIT 12`,
        [scope[0], scope[1], scope[3]],
      ),
      this.db.query(
        `SELECT d.id, d.title, d.status, d.rationale, d.decision_at, d.review_due_at, approver.name AS decision_maker
          FROM knowledge_decisions d
          LEFT JOIN users approver ON approver.id = d.approved_by_id AND approver.organization_id = d.organization_id
          WHERE d.organization_id = $1 AND d.status IN ('approved', 'implemented', 'reviewed', 'rejected')
            AND (d.team_id IS NULL OR $3 OR EXISTS (
              SELECT 1 FROM team_members tm WHERE tm.team_id = d.team_id AND tm.user_id = $2
            ))
          ORDER BY COALESCE(d.decision_at, d.updated_at) DESC, d.id LIMIT 12`, [...scope.slice(0, 3)],
      ),
      this.db.query(
        `SELECT id, name, last_run_at FROM workflows
          WHERE organization_id = $1 AND status::text = 'active' AND trigger_type = 'manual'
          ORDER BY name, id LIMIT 12`, [scope[0]],
      ),
      this.db.query(
        `SELECT r.id, r.status, r.created_at, w.name, requester.name AS requested_by, requester.id AS requester_id,
                run.id AS run_id, run.status AS run_status
         FROM briefing_workflow_requests r
         JOIN workflows w ON w.id = r.workflow_id AND w.organization_id = r.organization_id
         JOIN users requester ON requester.id = r.requested_by_id AND requester.organization_id = r.organization_id
         LEFT JOIN workflow_runs run ON run.workflow_id = w.id AND run.organization_id = r.organization_id
           AND run.event_key = 'briefing-workflow:' || r.id
         WHERE r.organization_id = $1 AND ($3 OR r.requested_by_id = $2)
         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id LIMIT 16`,
        [scope[0], scope[1], scope[3]],
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      schedule,
      items: items.rows.map(({ team_id, ...item }) => ({ ...item, source: sourceLinks[item.kind](item.id) })),
      goals: goals.rows,
      decisions: decisions.rows,
      workflows: workflows.rows,
      workflowRequests: workflowRequests.rows,
    };
  }

  private async requireItem(user: JwtPayload, key: string) {
    const parsed = typeof key === 'string' ? BRIEFING_ITEM_KEY.exec(key) : null;
    if (!parsed || !Object.prototype.hasOwnProperty.call(sourceLinks, parsed[1].toLowerCase())) {
      throw new BadRequestException('Invalid briefing item.');
    }
    const schedule = await this.preferences(user);
    const result = await this.db.query<Item>(
      BRIEFING_ITEMS + 'SELECT * FROM ranked WHERE item_key = $6',
      [...this.scope(user), briefingLookback(schedule.cadence), key.toLowerCase()],
    );
    if (!result.rows[0]) throw new NotFoundException('This briefing item is no longer available.');
    return result.rows[0];
  }

  async feedback(user: JwtPayload, key: string, disposition: 'dismissed' | 'useful' | 'reset') {
    const item = await this.requireItem(user, key);
    if (item.severity === 0 && disposition === 'dismissed') {
      throw new BadRequestException('Critical alerts stay visible until resolved.');
    }
    if (disposition === 'reset') {
      await this.db.query('DELETE FROM briefing_feedback WHERE organization_id = $1 AND user_id = $2 AND item_key = $3',
        [user.organizationId, user.sub, item.item_key]);
    } else {
      await this.db.query(
        `INSERT INTO briefing_feedback (organization_id, user_id, item_key, disposition)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, user_id, item_key) DO UPDATE SET disposition = EXCLUDED.disposition`,
        [user.organizationId, user.sub, item.item_key, disposition],
      );
    }
    return { disposition };
  }

  async createTask(user: JwtPayload, key: string) {
    const item = await this.requireItem(user, key);
    // Contract evidence is administrator-only and cannot be copied to an organization-visible task.
    if (['renewal', 'kpi', 'financial_approval'].includes(item.kind)) {
      throw new BadRequestException('Open the source to follow up on this item.');
    }
    return this.tasks.create(user.organizationId, user.sub, {
      title: ('Follow up: ' + item.title).slice(0, 200),
      description: item.next_step + '\n\nSource: ' + sourceLinks[item.kind](item.id),
      assigneeId: user.sub,
      teamId: item.team_id ?? undefined,
      projectId: item.kind === 'project' ? item.id : undefined,
      priority: item.severity === 0 ? 'high' : 'medium',
    }, { role: user.role, userId: user.sub }, { briefingItemKey: item.item_key });
  }

  async requestWorkflow(user: JwtPayload, workflowId: string) {
    return this.db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO briefing_workflow_requests (organization_id, workflow_id, requested_by_id)
         SELECT organization_id, id, $3 FROM workflows
         WHERE organization_id = $1 AND id = $2 AND status = 'active' AND trigger_type = 'manual'
         ON CONFLICT (organization_id, workflow_id, requested_by_id) WHERE status = 'pending' DO NOTHING
         RETURNING id, status`,
        [user.organizationId, workflowId, user.sub],
      );
      if (!result.rows[0]) throw new ConflictException('A request is pending or the workflow is no longer active.');
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, 'workflow.approval_requested', 'workflow', $3)`,
        [user.organizationId, user.sub, workflowId],
      );
      await client.query(
        `INSERT INTO notifications (id, user_id, organization_id, type, title, action_url, data)
         SELECT gen_random_uuid(), u.id, u.organization_id, 'workflow', 'Workflow approval requested',
           '/chief-of-staff', jsonb_build_object('workflowRequestId', $3::text)
         FROM users u
         WHERE u.organization_id = $1 AND u.id <> $2 AND u.is_active
           AND u.role::text IN ('owner', 'admin', 'manager')`,
        [user.organizationId, user.sub, result.rows[0].id],
      );
      return result.rows[0];
    });
  }

  async reviewWorkflow(user: JwtPayload, id: string, outcome: 'approved' | 'rejected') {
    const request = await this.db.transaction(async (client) => {
      const result = await client.query<{ workflow_id: string; status: string; requested_by_id: string }>(
        `SELECT r.workflow_id, r.status, r.requested_by_id FROM briefing_workflow_requests r
         JOIN workflows w ON w.id = r.workflow_id AND w.organization_id = r.organization_id
         JOIN users requester ON requester.id = r.requested_by_id AND requester.organization_id = r.organization_id
         WHERE r.id = $1 AND r.organization_id = $2 AND requester.is_active
           AND r.requested_by_id <> $3 AND ($4 = 'rejected' OR (w.status = 'active' AND w.trigger_type = 'manual'))
         FOR UPDATE OF r`,
        [id, user.organizationId, user.sub, outcome],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException('An eligible workflow request was not found.');
      if (current.status === outcome) return current;
      if (current.status !== 'pending') throw new ConflictException('This request has already been reviewed.');

      await client.query(
        `UPDATE briefing_workflow_requests SET status = $1, reviewed_by_id = $2, reviewed_at = NOW()
         WHERE id = $3 AND organization_id = $4`, [outcome, user.sub, id, user.organizationId],
      );
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, 'workflow', $4, jsonb_build_object('requestId', $5::text))`,
        [user.organizationId, user.sub, 'workflow.request_' + outcome, current.workflow_id, id],
      );
      await client.query(
        `INSERT INTO notifications (id, user_id, organization_id, type, title, action_url, data)
         VALUES (gen_random_uuid(), $1, $2, 'workflow', $3, '/chief-of-staff',
           jsonb_build_object('workflowRequestId', $4::text))`,
        [current.requested_by_id, user.organizationId, 'Workflow request ' + outcome, id],
      );
      return current;
    });
    if (outcome === 'approved') {
      await this.workflows.trigger(request.workflow_id, user.organizationId, { source: 'chief_of_staff', approvalId: id }, user.sub, 'briefing-workflow:' + id);
    }
    return { status: outcome };
  }

  async startWorkflow(user: JwtPayload, id: string) {
    const workflow = await this.workflows.findById(id, user.organizationId);
    if (workflow.trigger_type !== 'manual') throw new BadRequestException('Select an active manual workflow.');
    return this.workflows.trigger(id, user.organizationId, { source: 'chief_of_staff' }, user.sub);
  }

  async setSchedule(user: JwtPayload, schedule: Schedule) {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(schedule.hourUtc, 0, 0, 0);
    if (schedule.cadence === 'weekly') {
      const today = next.getUTCDay() || 7;
      next.setUTCDate(next.getUTCDate() + (schedule.weekday - today + 7) % 7);
    }
    if (schedule.cadence === 'monthly') {
      next.setUTCDate(1);
      if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
    } else if (next <= now) next.setUTCDate(next.getUTCDate() + (schedule.cadence === 'weekly' ? 7 : 1));
    await this.db.query(
      `INSERT INTO briefing_preferences (organization_id, user_id, cadence, hour_utc, weekday, next_delivery_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET cadence = EXCLUDED.cadence,
         hour_utc = EXCLUDED.hour_utc, weekday = EXCLUDED.weekday, next_delivery_at = EXCLUDED.next_delivery_at`,
      [user.organizationId, user.sub, schedule.cadence, schedule.hourUtc, schedule.weekday, schedule.cadence === 'off' ? null : next],
    );
    return this.preferences(user);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async deliverBriefings() {
    // Claim and advance each due schedule in the same statement as its notification.
    // The notification contains a link only. The API checks current permissions when it is opened.
    await this.db.query(
      `WITH due AS (
         SELECT p.organization_id, p.user_id, p.next_delivery_at
         FROM briefing_preferences p
         JOIN users u ON u.id = p.user_id AND u.organization_id = p.organization_id
         WHERE p.next_delivery_at <= NOW() AND p.cadence <> 'off' AND u.is_active = TRUE
           AND u.role::text IN ('owner', 'admin', 'manager', 'member')
         ORDER BY p.next_delivery_at LIMIT 250 FOR UPDATE OF p SKIP LOCKED
       ), delivered AS (
         INSERT INTO notifications (id, organization_id, user_id, type, title, message, action_url, data)
         SELECT gen_random_uuid(), organization_id, user_id, 'briefing',
           'Your Chief of Staff briefing is ready', 'Review current priorities and decisions.', '/chief-of-staff',
           jsonb_build_object('scheduledAt', next_delivery_at)
         FROM due RETURNING organization_id, user_id
       )
       UPDATE briefing_preferences p SET last_delivered_at = NOW(),
         next_delivery_at = CASE WHEN p.cadence = 'monthly' THEN
           (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month' + make_interval(hours => p.hour_utc::integer)) AT TIME ZONE 'UTC'
           WHEN p.cadence = 'weekly' THEN p.next_delivery_at + (floor(extract(epoch FROM (NOW() - p.next_delivery_at)) / 604800) + 1) * INTERVAL '168 hours'
           ELSE p.next_delivery_at + (floor(extract(epoch FROM (NOW() - p.next_delivery_at)) / 86400) + 1) * INTERVAL '24 hours' END
       FROM delivered d WHERE p.organization_id = d.organization_id AND p.user_id = d.user_id`,
    );
  }
}
