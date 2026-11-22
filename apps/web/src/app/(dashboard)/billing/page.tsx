'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Download, ExternalLink, FileText, Loader2, Minus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { PLAN_LABEL, trialDaysLeft, usePlan } from '@/hooks/use-plan';
import { useAuth } from '@/hooks/use-auth';
import { SegmentedControl, StatusBadge } from '@/components/ui/primitives';

type BillingInterval = 'monthly' | 'annual';

interface PlanLimits {
  users?: number | string;
  storage_gb?: number | string;
  storage_bytes?: number | string;
  ai_tokens_monthly?: number | string;
  documents?: number | string;
}

interface Plan {
  id: string;
  name: string;
  price_monthly: number | string | null;
  price_yearly: number | string | null;
  checkout_provider?: 'dodo';
  checkout_available?: Record<BillingInterval, boolean>;
  limits?: PlanLimits | null;
  stripe_price_monthly?: string | null;
  stripe_price_yearly?: string | null;
  is_active?: boolean;
  coming_soon?: boolean;
}

interface Subscription {
  plan_id?: string;
  plan_name?: string;
  status?: string;
  dodo_customer_id?: string;
  interval?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}

/** One row of billing history: a Dodo payment (with a downloadable receipt) or an earlier invoice. */
interface BillingEntry {
  id: string;
  date?: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string;
  card?: string | null;
  receiptAvailable: boolean;
  receiptUrl?: string | null;
  provider: 'dodo' | 'legacy';
}

const PLAN_ORDER = ['starter', 'growth', 'professional'];

const PLAN_PITCH: Record<string, string> = {
  starter: 'For small teams getting their work, documents and meetings into one place.',
  growth: 'For teams that want automation, decision tracking and financial reporting.',
  professional: 'For larger teams that need governance controls and room to grow.',
};

/** What each plan unlocks. Mirrors apps/api/src/billing/plan-policy.ts — the API enforces it. */
const COMPARISON: Array<{ label: string; plans: string[] }> = [
  { label: 'Tasks, projects and meetings', plans: ['starter', 'growth', 'professional'] },
  { label: 'Company Brain and AI Advisor', plans: ['starter', 'growth', 'professional'] },
  { label: 'Chief of Staff, goals and analytics', plans: ['starter', 'growth', 'professional'] },
  { label: 'Integrations, including Gmail and Drive', plans: ['starter', 'growth', 'professional'] },
  { label: 'Workflow automation', plans: ['growth', 'professional'] },
  { label: 'Decision tracking', plans: ['growth', 'professional'] },
  { label: 'Executive Intelligence (financial reporting)', plans: ['growth', 'professional'] },
  { label: 'Operations Manager agent', plans: ['growth', 'professional'] },
  { label: 'Decision governance: approval policies and delegation', plans: ['professional'] },
];

const num = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

function limitText(value: number | string | undefined, unit: string) {
  if (value === undefined || value === null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 0) return `Unlimited ${unit}`;
  return `${n.toLocaleString('en-US')} ${unit}`;
}

function storageText(limits: PlanLimits) {
  const bytes = num(limits.storage_bytes);
  const gb = bytes > 0 ? bytes / 1024 ** 3 : num(limits.storage_gb);
  return gb < 0 ? 'Unlimited storage' : `${Number(gb.toFixed(1)).toLocaleString('en-US')} GB storage`;
}

function tokensText(value: number | string | undefined) {
  const n = num(value);
  if (n < 0) return 'Unlimited AI usage';
  const short = n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(1))}M` : `${Math.round(n / 1000)}k`;
  return `${short} AI tokens / month`;
}

function PlanColumn({
  plan,
  interval,
  current,
  popular,
  loading,
  onSubscribe,
}: {
  plan: Plan;
  interval: BillingInterval;
  current: boolean;
  popular: boolean;
  loading: boolean;
  onSubscribe: () => void;
}) {
  const monthly = num(plan.price_monthly);
  const yearly = num(plan.price_yearly);
  const shown = interval === 'annual' ? Math.round(yearly / 12) : monthly;
  const saving = Math.max(0, monthly * 12 - yearly);
  const limits = plan.limits ?? {};
  const checkoutAvailable =
    plan.checkout_provider === 'dodo'
      ? Boolean(plan.checkout_available?.[interval])
      : Boolean(interval === 'annual' ? plan.stripe_price_yearly : plan.stripe_price_monthly);

  return (
    <section
      aria-label={`${plan.name} plan`}
      className={cn(
        'relative flex flex-col rounded-xl border bg-card p-6',
        popular ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{plan.name}</h2>
        {current ? <StatusBadge tone="success">Current plan</StatusBadge> : popular ? <StatusBadge tone="primary" dot={false}>Most popular</StatusBadge> : null}
      </div>
      <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{PLAN_PITCH[plan.id]}</p>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">${money(shown)}</span>
        <span className="text-sm text-muted-foreground">/ month</span>
      </div>
      <p className="mt-1 h-4 text-xs text-muted-foreground">
        {interval === 'annual' ? `$${money(yearly)} billed yearly${saving > 0 ? ` · save $${money(saving)}` : ''}` : `or $${money(yearly)} / year`}
      </p>

      <div className="mt-5">
        {current ? (
          <button disabled className="h-10 w-full rounded-lg border border-border text-sm font-medium text-muted-foreground">You’re on this plan</button>
        ) : !checkoutAvailable ? (
          <button disabled title="Payment products are not configured on the server yet." className="h-10 w-full cursor-not-allowed rounded-lg bg-muted text-sm font-medium text-muted-foreground">
            Checkout not available yet
          </button>
        ) : (
          <button
            onClick={onSubscribe}
            disabled={loading}
            className={cn(
              'h-10 w-full rounded-lg text-sm font-medium transition disabled:opacity-60',
              popular ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border-strong hover:bg-muted',
            )}
          >
            {loading ? 'Opening checkout…' : `Choose ${plan.name}`}
          </button>
        )}
      </div>

      <ul className="mt-6 space-y-2 border-t border-border pt-5 text-sm">
        {[limitText(limits.users, num(limits.users) === 1 ? 'team member' : 'team members'), limitText(limits.documents, 'documents'), storageText(limits), tokensText(limits.ai_tokens_monthly)].map((line) => (
          <li key={line} className="flex items-center gap-2 text-foreground/90">
            <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BillingPage() {
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState(false);
  const { data: entitlements } = usePlan();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = ['owner', 'admin'].includes(String(user?.role ?? ''));
  const [downloading, setDownloading] = useState<string | null>(null);

  const refreshBilling = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['billing'] }),
    queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
  ]);

  // Confirms the payment with Dodo directly, so the plan updates even if a webhook is late or lost.
  const sync = useMutation({
    mutationFn: async () => (await api.post('/billing/sync')).data?.data as { applied: number; subscription: Subscription | null },
    onSuccess: () => void refreshBilling(),
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('checkout') !== 'dodo') return;
    setCheckoutReturn(true);
    let stopped = false;
    let attempts = 0;
    const run = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const result = (await api.post('/billing/sync')).data?.data as { subscription?: Subscription | null };
        await refreshBilling();
        if (result?.subscription?.status === 'active' || attempts >= 18) return;
      } catch {
        if (attempts >= 18) return;
      }
      setTimeout(() => void run(), 5000);
    };
    void run();
    const timer = setTimeout(() => setCheckoutReturn(false), 120_000);
    return () => { stopped = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery<Plan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const data = (await api.get('/billing/plans')).data?.data;
      return Array.isArray(data) ? (data as Plan[]).filter((p) => p.is_active !== false) : [];
    },
  });

  const { data: subscription } = useQuery<Subscription | null>({
    queryKey: ['billing', 'subscription'],
    refetchInterval: (query) => (checkoutReturn && query.state.data?.status !== 'active' ? 4000 : false),
    queryFn: async () => (await api.get('/billing/subscription')).data?.data ?? null,
  });

  const history = useQuery<BillingEntry[]>({
    queryKey: ['billing', 'invoices'],
    enabled: canManage,
    queryFn: async () => {
      const data = (await api.get('/billing/invoices')).data?.data;
      return Array.isArray(data) ? (data as BillingEntry[]) : [];
    },
  });
  const invoices = history.data ?? [];

  async function downloadReceipt(entry: BillingEntry) {
    if (entry.receiptUrl) {
      window.open(entry.receiptUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setDownloading(entry.id);
    try {
      const response = await api.get(`/billing/invoices/${encodeURIComponent(entry.id)}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lumorius-receipt-${entry.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      toast.error('The receipt could not be downloaded. Try again.');
    } finally {
      setDownloading(null);
    }
  }

  const checkout = useMutation({
    mutationFn: async ({ planId, interval: chosen }: { planId: string; interval: BillingInterval }) => {
      setLoadingPlan(planId);
      return (await api.post('/billing/checkout', { planId, interval: chosen })).data.data as { url: string };
    },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
      else toast.error('Checkout did not return a payment link.');
    },
    onError: (error) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Checkout could not be opened.');
    },
    onSettled: () => setLoadingPlan(null),
  });

  const portal = useMutation({
    mutationFn: async () => (await api.post('/billing/portal', { returnUrl: window.location.href })).data.data as { url: string },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
      else toast.error('The billing portal did not return a URL.');
    },
    onError: () => toast.error('Could not open the billing portal.'),
  });

  const purchasable = PLAN_ORDER.map((id) => plans.find((p) => p.id === id)).filter((p): p is Plan => Boolean(p));
  const enterprise = plans.find((p) => p.id === 'enterprise');
  const currentPlan = entitlements?.plan;
  const days = trialDaysLeft(entitlements);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prices in US dollars, excluding any local taxes. Cancel any time.</p>
        </div>
        {subscription?.dodo_customer_id && (
          <button
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" /> Manage subscription
          </button>
        )}
      </header>

      {checkoutReturn && (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {subscription?.status === 'active' ? 'Payment confirmed. Your subscription is active.' : 'Checking your payment… this page updates automatically.'}
        </p>
      )}

      {entitlements && (
        <section aria-label="Current plan" className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Current plan</p>
            <p className="mt-1 text-lg font-semibold">{PLAN_LABEL[entitlements.plan]}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {entitlements.status === 'trialing'
                ? `${days} ${days === 1 ? 'day' : 'days'} left. During the trial you have Growth features with a smaller allowance. Pick a plan any time; it starts immediately.`
                : entitlements.status === 'expired'
                  ? 'Your trial has ended. Your data is kept. Choose a plan below to turn your workspace back on.'
                  : subscription?.current_period_end
                    ? `${subscription.cancel_at_period_end ? 'Ends' : 'Renews'} on ${new Date(subscription.current_period_end).toLocaleDateString()}.`
                    : 'Active.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {entitlements.status !== 'active' && (
              <StatusBadge tone={entitlements.status === 'expired' ? 'warning' : 'info'}>{entitlements.status === 'expired' ? 'Trial ended' : 'Trial'}</StatusBadge>
            )}
            {canManage && (
              <button
                type="button"
                disabled={sync.isPending}
                onClick={() => sync.mutate(undefined, {
                  onSuccess: (data) => toast.success(data?.applied ? 'Billing updated from Dodo Payments.' : 'Billing is up to date.'),
                  onError: () => toast.error('Could not reach Dodo Payments. Try again.'),
                })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} /> Refresh status
              </button>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Plans</h2>
        <SegmentedControl
          label="Billing interval"
          value={interval}
          onChange={setBillingInterval}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Yearly · 2 months free' },
          ]}
        />
      </div>

      {plansLoading ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="lm-skeleton h-96 rounded-xl" />)}</div>
      ) : plansError || purchasable.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Plans could not be loaded. Check that the API is running.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {purchasable.map((plan) => (
            <PlanColumn
              key={plan.id}
              plan={plan}
              interval={interval}
              current={currentPlan === plan.id}
              popular={plan.id === 'growth'}
              loading={loadingPlan === plan.id && checkout.isPending}
              onSubscribe={() => checkout.mutate({ planId: plan.id, interval })}
            />
          ))}
        </div>
      )}

      {purchasable.length > 0 && (
        <section aria-label="Plan comparison" className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">What each plan includes</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="p-4 font-medium text-muted-foreground">Included</th>
                {purchasable.map((p) => (
                  <th key={p.id} scope="col" className="w-32 p-4 text-center font-medium">{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <th scope="row" className="p-4 text-left font-normal text-foreground/90">{row.label}</th>
                  {purchasable.map((p) => (
                    <td key={p.id} className="p-4 text-center">
                      {row.plans.includes(p.id) ? (
                        <Check className="mx-auto h-4 w-4 text-foreground" aria-label="Included" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not included" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {enterprise && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border-strong p-5">
          <div>
            <h2 className="text-sm font-semibold">Enterprise</h2>
            <p className="mt-1 text-sm text-muted-foreground">Unlimited seats and usage, custom terms and invoicing. Not available for self-serve checkout yet.</p>
          </div>
        </section>
      )}

      {canManage && (
        <section aria-labelledby="billing-history-title">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="billing-history-title" className="text-base font-semibold">Billing history</h2>
            <p className="text-xs text-muted-foreground">Receipts are issued by Dodo Payments, our merchant of record.</p>
          </div>
          {history.isPending ? (
            <div aria-hidden="true" className="lm-skeleton h-24 rounded-xl" />
          ) : history.isError ? (
            <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Billing history could not be loaded. <button type="button" onClick={() => void history.refetch()} className="underline">Retry</button>
            </p>
          ) : invoices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">No payments yet. After you subscribe, each payment and its receipt appears here.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[620px] text-sm">
                <caption className="sr-only">Payments and receipts</caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    {['Date', 'Description', 'Amount', 'Status', 'Receipt'].map((h) => (
                      <th key={h} scope="col" className="p-4 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((entry) => {
                    const ok = entry.status === 'succeeded' || entry.status === 'paid';
                    return (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap p-4">{entry.date ? new Date(entry.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="p-4">
                          <span className="block">{entry.description}</span>
                          {entry.card && <span className="block text-xs text-muted-foreground">{entry.card}</span>}
                        </td>
                        <td className="p-4 font-medium tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: (entry.currency || 'USD').toUpperCase() }).format(entry.amount)}</td>
                        <td className="p-4"><StatusBadge tone={ok ? 'success' : 'warning'}>{ok ? 'Paid' : entry.status.replace(/_/g, ' ')}</StatusBadge></td>
                        <td className="p-4">
                          {entry.receiptAvailable || entry.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() => void downloadReceipt(entry)}
                              disabled={downloading === entry.id}
                              className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:opacity-60"
                            >
                              {downloading === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : entry.receiptUrl ? <FileText className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                              {entry.receiptUrl ? 'Open invoice' : 'Download receipt'}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
