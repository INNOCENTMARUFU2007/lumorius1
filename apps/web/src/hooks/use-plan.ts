'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

export type PlanId = 'trial' | 'starter' | 'growth' | 'professional' | 'expired';
export type PlanModule = 'core' | 'workflows' | 'decisions';

export interface Entitlements {
  plan: PlanId;
  status: 'active' | 'trialing' | 'expired';
  trialEndsAt: string | null;
  agents: string[];
  features: string[];
  modules: PlanModule[];
}

export const PLAN_LABEL: Record<PlanId, string> = {
  trial: 'Free trial',
  starter: 'Starter',
  growth: 'Growth',
  professional: 'Professional',
  expired: 'Trial ended',
};

/** Routes that stay usable after a trial ends so the owner can pay, manage access or export data. */
const ALWAYS_OPEN = ['/billing', '/settings', '/security', '/team', '/notifications', '/admin'];

/** Frontend mirror of the API's RequiresModule / RequiresFeature tags. The API remains the enforcement point. */
const ROUTE_RULES: Array<{ prefix: string; module?: PlanModule; feature?: string; minPlan: string }> = [
  { prefix: '/workflows', module: 'workflows', minPlan: 'Growth' },
  { prefix: '/decisions', module: 'decisions', minPlan: 'Growth' },
  { prefix: '/executive-intelligence', feature: 'advanced_financial', minPlan: 'Growth' },
  { prefix: '/business-twin', feature: 'business_twin', minPlan: 'a future plan' },
];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/');

export type RouteAccess = { allowed: true } | { allowed: false; reason: 'expired' | 'upgrade'; minPlan?: string };

export function routeAccess(pathname: string, plan: Entitlements | undefined): RouteAccess {
  if (!plan) return { allowed: true }; // still loading; the API enforces regardless
  if (ALWAYS_OPEN.some((p) => matches(pathname, p))) return { allowed: true };
  if (plan.status === 'expired') return { allowed: false, reason: 'expired' };
  const rule = ROUTE_RULES.find((r) => matches(pathname, r.prefix));
  if (!rule) return { allowed: true };
  const ok = rule.module ? plan.modules.includes(rule.module) : rule.feature ? plan.features.includes(rule.feature) : true;
  return ok ? { allowed: true } : { allowed: false, reason: 'upgrade', minPlan: rule.minPlan };
}

export function trialDaysLeft(plan: Entitlements | undefined): number | null {
  if (!plan?.trialEndsAt || plan.status !== 'trialing') return null;
  return Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / 86_400_000));
}

export function usePlan() {
  const { user } = useAuth();
  return useQuery<Entitlements>({
    queryKey: ['entitlements', user?.organizationId],
    enabled: Boolean(user?.organizationId),
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const body = (await api.get('/billing/entitlements')).data as { data?: Entitlements } & Partial<Entitlements>;
      const data = (body.data ?? body) as Entitlements;
      return { ...data, modules: data.modules ?? [], features: data.features ?? [], agents: data.agents ?? [] };
    },
  });
}
