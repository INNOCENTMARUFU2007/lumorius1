
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Check,
  CreditCard,
  FileText,
  ExternalLink,
  Shield,
  Zap,
  Star,
  Building2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

type BillingInterval = 'monthly' | 'annual';

interface PlanLimits {
  users?: number | string;
  storage_gb?: number | string;
  ai_tokens_monthly?: number | string;
  documents?: number | string;
}

interface Plan {
  id: string;
  name: string;
  tier?: string;
  description?: string;
  price_monthly: number | string;
  price_yearly: number | string;
  limits?: PlanLimits | null;
  features?: unknown;
  stripe_price_monthly?: string | null;
  stripe_price_yearly?: string | null;
  is_active?: boolean;
}

interface Subscription {
  plan_id?: string;
  plan_name?: string;
  status?: string;
  interval?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}

interface Invoice {
  id: string;
  created_at?: string;
  paid_at?: string | null;
  amount_due?: number | string;
  amount_paid?: number | string;
  currency?: string;
  status?: string;
  invoice_pdf?: string | null;
}

const PLAN_ICONS: Record<string, LucideIcon> = {
  free: Zap,
  starter: Star,
  professional: Shield,
  enterprise: Building2,
};

function PlanIconDisplay({
  planId,
  className,
}: {
  planId?: string;
  className?: string;
}) {
  const Icon = planId ? PLAN_ICONS[planId] : undefined;

  if (!Icon) {
    return <CreditCard className={className} />;
  }

  return <Icon className={className} />;
}

const PLAN_GRADIENTS: Record<string, string> = {
  free: 'from-gray-600 to-gray-700',
  starter: 'from-slate-600 to-slate-700',
  professional: 'from-violet-600 to-indigo-600',
  enterprise: 'from-emerald-600 to-teal-600',
};

const PLAN_BADGES: Record<string, string | null> = {
  free: null,
  starter: null,
  professional: 'Most Popular',
  enterprise: null,
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: 'Explore Lumorius with the essential tools for getting started.',
  starter: 'For founders and small teams building their operations.',
  professional: 'For growing companies that need a unified company workspace.',
  enterprise: 'For organisations requiring enterprise-level scale and control.',
};

const FALLBACK_FEATURES: Record<string, string[]> = {
  free: [
    'Core Lumorius workspace',
    'Essential founder tools',
    'Limited AI usage',
  ],
  starter: [
    'Expanded workspace limits',
    'Team collaboration',
    'AI-powered productivity tools',
  ],
  professional: [
    'Advanced workspace limits',
    'AI-powered workflows',
    'Company knowledge and analytics',
  ],
  enterprise: [
    'Enterprise-scale workspace',
    'Advanced administration',
    'Enterprise support options',
  ],
};

function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatLimit(
  value: number | string | undefined,
  suffix = '',
): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return '—';
  if (amount < 0) return 'Unlimited';

  return `${amount.toLocaleString('en-US')}${suffix}`;
}

function formatTokens(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return '—';
  if (amount < 0) return 'Unlimited';

  if (amount >= 1_000_000) {
    return `${Number((amount / 1_000_000).toFixed(1))}M`;
  }

  if (amount >= 1_000) {
    return `${Number((amount / 1_000).toFixed(1))}k`;
  }

  return amount.toLocaleString('en-US');
}

function getFeatures(value: unknown, planId: string): string[] {
  if (Array.isArray(value)) {
    const strings = value.filter(
      (item): item is string => typeof item === 'string',
    );

    return strings.length > 0
      ? strings
      : (FALLBACK_FEATURES[planId] ?? []);
  }

  if (value && typeof value === 'object') {
    const enabledFeatures = Object.entries(
      value as Record<string, unknown>,
    )
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) =>
        name
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (character) => character.toUpperCase()),
      );

    return enabledFeatures.length > 0
      ? enabledFeatures
      : (FALLBACK_FEATURES[planId] ?? []);
  }

  return FALLBACK_FEATURES[planId] ?? [];
}

function PlanCard({
  plan,
  current,
  billing,
  onSubscribe,
  onContactSales,
  loading,
}: {
  plan: Plan;
  current: boolean;
  billing: BillingInterval;
  onSubscribe: (planId: string, interval: BillingInterval) => void;
  onContactSales: () => void;
  loading: boolean;
}) {
  const isEnterprise = plan.id === 'enterprise';
  const isFree = plan.id === 'free';

  const monthly = asNumber(plan.price_monthly);
  const annual = asNumber(plan.price_yearly);

  const displayPrice =
    billing === 'annual' ? Math.round(annual / 12) : monthly;

  const annualSaving = Math.max(0, monthly * 12 - annual);
  const savingsPercent =
    monthly > 0
      ? Math.round((annualSaving / (monthly * 12)) * 100)
      : 0;

  const badge = PLAN_BADGES[plan.id] ?? null;
  const gradient =
    PLAN_GRADIENTS[plan.id] ?? PLAN_GRADIENTS.starter;

  const selectedStripePrice =
    billing === 'annual'
      ? plan.stripe_price_yearly
      : plan.stripe_price_monthly;

  const limits = plan.limits ?? {};
  const features = getFeatures(plan.features, plan.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col overflow-hidden rounded-2xl border ${
        current
          ? 'border-violet-500 shadow-xl shadow-violet-500/20'
          : 'border-gray-800'
      } bg-gray-900`}
    >
      {badge && (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
          <span className="rounded-b-lg bg-violet-600 px-3 py-1 text-[11px] font-bold text-white shadow">
            {badge}
          </span>
        </div>
      )}

      {current && (
        <div className="absolute right-3 top-3 z-10">
          <span className="rounded-full border border-violet-500/30 bg-violet-500/20 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
            Current Plan
          </span>
        </div>
      )}

      {/* Plan and pricing */}
      <div className={`bg-gradient-to-br ${gradient} p-5`}>
        <div className="mb-4 flex items-center gap-2 text-white">
          <PlanIconDisplay planId={plan.id} className="h-5 w-5" />
          <span className="text-lg font-bold">{plan.name}</span>
        </div>

        <div className="flex items-end gap-1 text-white">
          <span className="text-lg font-medium text-white/80">$</span>
          <span className="text-4xl font-black">
            {formatMoney(displayPrice)}
          </span>
          <span className="mb-1 text-sm text-white/70">/mo</span>
        </div>

        {monthly === 0 && annual === 0 ? (
          <p className="mt-2 text-xs text-white/80">Free forever</p>
        ) : billing === 'annual' ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-white/90">
              Billed ${formatMoney(annual)} per year
            </p>

            {annualSaving > 0 && (
              <p className="text-xs text-white/80">
                2 months free · Save ${formatMoney(annualSaving)} per year
                {' '}({savingsPercent}% off)
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-white/70">
            Or ${formatMoney(annual)} per year with 2 months free
          </p>
        )}
      </div>

      {/* Plan details */}
      <div className="flex flex-1 flex-col p-5">
        <p className="mb-4 text-sm text-gray-400">
          {plan.description ?? PLAN_DESCRIPTIONS[plan.id] ?? ''}
        </p>

        {/* Limits */}
        <div className="mb-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-800 p-2">
            <p className="text-sm font-bold text-white">
              {formatLimit(limits.users)}
            </p>
            <p className="text-[10px] text-gray-500">Users</p>
          </div>

          <div className="rounded-lg bg-gray-800 p-2">
            <p className="text-sm font-bold text-white">
              {formatLimit(limits.storage_gb, ' GB')}
            </p>
            <p className="text-[10px] text-gray-500">Storage</p>
          </div>

          <div className="rounded-lg bg-gray-800 p-2">
            <p className="text-sm font-bold text-white">
              {formatTokens(limits.ai_tokens_monthly)}
            </p>
            <p className="text-[10px] text-gray-500">AI tokens/mo</p>
          </div>
        </div>

        {/* Features */}
        <ul className="mb-6 flex-1 space-y-2">
          {features.map((feature, index) => (
            <li
              key={`${plan.id}-${index}`}
              className="flex items-start gap-2 text-sm text-gray-300"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {/* Actions */}
        {current ? (
          <button
            disabled
            className="w-full cursor-default rounded-xl bg-gray-800 py-3 text-sm font-semibold text-gray-400"
          >
            ✓ Current Plan
          </button>
        ) : isFree ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-gray-800 py-3 text-sm font-semibold text-gray-500"
          >
            Free tier
          </button>
        ) : isEnterprise ? (
          <button
            onClick={onContactSales}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/10"
          >
            Contact Sales <ArrowRight className="h-4 w-4" />
          </button>
        ) : !selectedStripePrice ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-gray-800 py-3 text-sm font-semibold text-gray-500"
            title={`Configure the ${billing} Stripe price ID for this plan`}
          >
            Stripe price not configured
          </button>
        ) : (
          <button
            onClick={() => onSubscribe(plan.id, billing)}
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${gradient} py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50`}
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <>
                Subscribe <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInterval>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const response = await api.get('/billing/plans');
      const data = response.data?.data;

      if (!Array.isArray(data)) return [];

      return (data as Plan[]).filter(
        (plan) =>
          plan.id !== 'growth' &&
          plan.id !== 'custom' &&
          plan.is_active !== false,
      );
    },
  });

  const { data: subscription } = useQuery<Subscription | null>({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const response = await api.get('/billing/subscription');
      return response.data?.data ?? null;
    },
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['billing', 'invoices'],
    queryFn: async () => {
      const response = await api.get('/billing/invoices');

      return Array.isArray(response.data?.data)
        ? (response.data.data as Invoice[])
        : [];
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({
      planId,
      interval,
    }: {
      planId: string;
      interval: BillingInterval;
    }) => {
      setLoadingPlan(planId);

      const response = await api.post('/billing/checkout', {
        planId,
        interval,
        successUrl: `${window.location.origin}/billing?success=1`,
        cancelUrl: `${window.location.origin}/billing?cancel=1`,
      });

      return response.data.data as { url: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('Checkout did not return a Stripe URL.');
      }
    },
    onError: () => {
      toast.error('Checkout failed. Check your Stripe configuration.');
    },
    onSettled: () => {
      setLoadingPlan(null);
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/billing/portal', {
        returnUrl: window.location.href,
      });

      return response.data.data as { url: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('The billing portal did not return a URL.');
      }
    },
    onError: () => {
      toast.error('Could not open the billing portal.');
    },
  });

  const handleContactSales = () => {
    window.location.href =
      'mailto:sales@lumorius.com?subject=Lumorius%20Enterprise%20Plan%20Inquiry';
  };

  const currentPlanId = subscription?.plan_id;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2">
            <CreditCard className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Billing &amp; Subscriptions
            </h1>
            <p className="text-sm text-gray-400">
              All prices in USD. Annual billing includes two months free.
            </p>
          </div>
        </div>

        {subscription && (
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="flex items-center gap-2 rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            Manage Billing
          </button>
        )}
      </div>

      {/* Current subscription */}
      {subscription && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap items-center gap-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20">
              <PlanIconDisplay
                planId={subscription.plan_id}
                className="h-5 w-5 text-violet-400"
              />
            </div>
            <div>
              <p className="text-sm text-gray-400">Active Plan</p>
              <p className="text-lg font-bold text-white">
                {subscription.plan_name ??
                  subscription.plan_id ??
                  'Unknown'}
              </p>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-gray-700 sm:block" />

          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span
              className={`text-sm font-semibold capitalize ${
                subscription.status === 'active'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {subscription.status ?? 'Unknown'}
            </span>
          </div>

          <div>
            <p className="text-xs text-gray-500">Billing</p>
            <p className="text-sm font-semibold capitalize text-white">
              {subscription.interval ?? '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Renews</p>
            <p className="text-sm font-semibold text-white">
              {subscription.current_period_end
                ? new Date(
                    subscription.current_period_end,
                  ).toLocaleDateString()
                : '—'}
            </p>
          </div>

          {subscription.cancel_at_period_end && (
            <div className="ml-auto">
              <span className="rounded-lg border border-red-500/20 bg-red-500/20 px-3 py-1.5 text-xs text-red-400">
                Cancels at period end
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Billing interval */}
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="flex items-center rounded-xl border border-gray-800 bg-gray-900 p-1">
          <button
            onClick={() => setBilling('monthly')}
            aria-pressed={billing === 'monthly'}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              billing === 'monthly'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly
          </button>

          <button
            onClick={() => setBilling('annual')}
            aria-pressed={billing === 'annual'}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              billing === 'annual'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Annual
          </button>
        </div>

        {billing === 'annual' && (
          <p className="text-xs text-emerald-400">
            Pay for 10 months and get 12 months of service.
          </p>
        )}
      </div>

      {/* Plans */}
      {plansLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/40 border-t-violet-500" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="font-semibold text-white">
            No billing plans are available.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Check that the billing API is running and the plans are active.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={currentPlanId === plan.id}
              billing={billing}
              loading={
                loadingPlan === plan.id &&
                checkoutMutation.isPending
              }
              onSubscribe={(planId, interval) =>
                checkoutMutation.mutate({ planId, interval })
              }
              onContactSales={handleContactSales}
            />
          ))}
        </div>
      )}

      {/* Trust information */}
      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        {[
          { icon: Shield, text: 'Stripe-secured payments' },
          { icon: Check, text: 'Cancel anytime' },
          { icon: Zap, text: 'Flexible billing intervals' },
        ].map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2 text-sm text-gray-500"
          >
            <Icon className="h-4 w-4 text-gray-600" />
            {text}
          </div>
        ))}
      </div>

      {/* Invoice history */}
      {invoices.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Invoice History
          </h2>

          <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="p-4 text-left font-medium text-gray-500">
                    Date
                  </th>
                  <th className="p-4 text-left font-medium text-gray-500">
                    Amount
                  </th>
                  <th className="p-4 text-left font-medium text-gray-500">
                    Status
                  </th>
                  <th className="p-4 text-left font-medium text-gray-500">
                    Invoice
                  </th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => {
                  const status = invoice.status ?? 'unknown';
                  const amount =
                    status === 'paid'
                      ? asNumber(
                          invoice.amount_paid ?? invoice.amount_due,
                        )
                      : asNumber(
                          invoice.amount_due ?? invoice.amount_paid,
                        );

                  const currency = (
                    invoice.currency ?? 'USD'
                  ).toUpperCase();

                  const date =
                    invoice.paid_at ?? invoice.created_at;

                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40"
                    >
                      <td className="p-4 text-gray-300">
                        {date
                          ? new Date(date).toLocaleDateString()
                          : '—'}
                      </td>

                      <td className="p-4 font-semibold text-white">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency,
                        }).format(amount)}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                            status === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="p-4">
                        {invoice.invoice_pdf ? (
                          <a
                            href={invoice.invoice_pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-violet-400 transition hover:text-violet-300"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Download
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
