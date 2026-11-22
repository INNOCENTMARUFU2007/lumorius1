/**
 * Lumorius commercial plan policy — the single place that decides what a
 * workspace may use. There is no free tier: new workspaces get a 14-day trial,
 * after which a paid plan is required.
 *
 *   trial        14 days, Growth modules, small allowance (see billing_plans 'free' row)
 *   starter      $49  — small teams: core workspace
 *   growth       $99  — + Workflows, Decisions, Executive Intelligence, 3 agents
 *   professional $199 — + advanced governance
 *   expired      trial over / subscription ended: workspace modules locked
 */
export type PaidPlan = 'starter' | 'growth' | 'professional';
export type Plan = PaidPlan | 'trial' | 'expired';
export type PaidFeature = 'business_twin' | 'advanced_financial' | 'advanced_governance';
/** Product areas gated at the API (see RequiresModule). */
export type Module = 'core' | 'workflows' | 'decisions';

export const TRIAL_DAYS = 14;
export const PAID_PLANS: readonly PaidPlan[] = ['starter', 'growth', 'professional'];

const baseAgents = ['chief-of-staff', 'integration-engineer'];

export function planPolicy(plan: string): { agents: string[]; features: PaidFeature[]; modules: Module[] } {
  switch (plan) {
    case 'professional':
      return { agents: [...baseAgents, 'operations-manager', 'financial-analyst'], features: ['advanced_financial', 'advanced_governance'], modules: ['core', 'workflows', 'decisions'] };
    case 'growth':
    case 'trial':
      return { agents: [...baseAgents, 'operations-manager', 'financial-analyst'], features: ['advanced_financial'], modules: ['core', 'workflows', 'decisions'] };
    case 'starter':
      return { agents: [...baseAgents], features: [], modules: ['core'] };
    default:
      return { agents: [], features: [], modules: [] };
  }
}

export interface WorkspacePlanRow {
  plan_id: string;
  trial_ends_at: Date | string | null;
  created_at: Date | string;
}

export function trialEndsAt(row: Pick<WorkspacePlanRow, 'trial_ends_at' | 'created_at'>): Date {
  if (row.trial_ends_at) return new Date(row.trial_ends_at);
  return new Date(new Date(row.created_at).getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * organizations.plan_id is authoritative: the payment webhook keeps it in sync
 * with the active subscription, and platform admins can set it for comped
 * workspaces. Anything that is not a paid plan falls back to the trial window.
 * Unknown values (including legacy 'enterprise' / 'custom') fail closed.
 */
export function resolvePlan(row: WorkspacePlanRow | null | undefined, now = new Date()): Plan {
  if (!row) return 'expired';
  if ((PAID_PLANS as readonly string[]).includes(row.plan_id)) return row.plan_id as PaidPlan;
  if (row.plan_id === 'free' && trialEndsAt(row).getTime() > now.getTime()) return 'trial';
  return 'expired';
}
