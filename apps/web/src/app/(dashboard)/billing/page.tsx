'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Check, CreditCard, FileText, ExternalLink,
  Shield, Zap, Star, Building2, ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter:      <Zap className="w-5 h-5" />,
  growth:       <Star className="w-5 h-5" />,
  professional: <Shield className="w-5 h-5" />,
  enterprise:   <Building2 className="w-5 h-5" />,
};

const PLAN_GRADIENTS: Record<string, string> = {
  starter:      'from-slate-600  to-slate-700',
  growth:       'from-violet-600 to-indigo-600',
  professional: 'from-amber-500  to-orange-500',
  enterprise:   'from-emerald-600 to-teal-600',
};

const BADGE: Record<string, string | null> = {
  starter:      null,
  growth:       'Most Popular',
  professional: 'Best Value',
  enterprise:   null,
};

interface Plan {
  id: string;
  name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_users: number;
  storage_gb: number;
  ai_requests_per_month: number;
  features: string[];
  stripe_price_id_monthly: string | null;
}

function PlanCard({
  plan, current, billing, onSubscribe, onContactSales, loading,
}: {
  plan: Plan;
  current: boolean;
  billing: 'monthly' | 'annual';
  onSubscribe: (planId: string, interval: string) => void;
  onContactSales: () => void;
  loading: boolean;
}) {
  const isEnterprise = plan.id === 'enterprise';
  const monthly = plan.monthly_price_cents / 100;
  const annual  = plan.annual_price_cents  / 100;
  const displayPrice = billing === 'annual' ? (annual / 12).toFixed(0) : monthly.toFixed(0);
  const savings = monthly > 0 ? Math.round(((monthly * 12 - annual) / (monthly * 12)) * 100) : 0;
  const badge = BADGE[plan.id];
  const gradient = PLAN_GRADIENTS[plan.id] ?? PLAN_GRADIENTS.starter;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col rounded-2xl overflow-hidden border ${
        current ? 'border-violet-500 shadow-xl shadow-violet-500/20' : 'border-gray-800'
      } bg-gray-900`}
    >
      {/* Badge */}
      {badge && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <span className="bg-violet-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow">
            {badge}
          </span>
        </div>
      )}
      {current && (
        <div className="absolute top-3 right-3">
          <span className="bg-violet-500/20 text-violet-400 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-violet-500/30">
            Current Plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`bg-gradient-to-br ${gradient} p-5`}>
        <div className="flex items-center gap-2 text-white mb-3">
          {PLAN_ICONS[plan.id]}
          <span className="font-bold text-lg">{plan.name}</span>
        </div>
        {isEnterprise ? (
          <div className="text-white">
            <p className="text-3xl font-black">Custom</p>
            <p className="text-white/70 text-sm mt-1">Tailored for your enterprise</p>
          </div>
        ) : (
          <div>
            <div className="flex items-end gap-1">
              <span className="text-white/80 text-lg font-medium">$</span>
              <span className="text-white text-4xl font-black">{displayPrice}</span>
              <span className="text-white/70 text-sm mb-1">/mo</span>
            </div>
            {billing === 'annual' && savings > 0 && (
              <p className="text-white/80 text-xs mt-1">Save {savings}% · billed ${annual.toFixed(0)}/year</p>
            )}
            {billing === 'monthly' && (
              <p className="text-white/60 text-xs mt-1">${(annual / 12).toFixed(0)}/mo billed annually</p>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col">
        <p className="text-gray-400 text-sm mb-4">{plan.description}</p>

        {/* Limits */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-white text-sm font-bold">{plan.max_users ?? '∞'}</p>
            <p className="text-gray-500 text-[10px]">Users</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-white text-sm font-bold">{plan.storage_gb ?? '∞'}GB</p>
            <p className="text-gray-500 text-[10px]">Storage</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-white text-sm font-bold">
              {plan.ai_requests_per_month
                ? plan.ai_requests_per_month >= 1000
                  ? `${(plan.ai_requests_per_month / 1000).toFixed(0)}k`
                  : plan.ai_requests_per_month
                : '∞'}
            </p>
            <p className="text-gray-500 text-[10px]">AI/mo</p>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-2 flex-1 mb-5">
          {(plan.features ?? []).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <Check className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        {/* CTA */}
        {isEnterprise ? (
          <button
            onClick={onContactSales}
            className="w-full py-3 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition font-semibold text-sm flex items-center justify-center gap-2"
          >
            Contact Sales <ArrowRight className="w-4 h-4" />
          </button>
        ) : current ? (
          <button className="w-full py-3 rounded-xl bg-gray-800 text-gray-400 font-semibold text-sm cursor-default">
            ✓ Current Plan
          </button>
        ) : !plan.stripe_price_id_monthly ? (
          <button className="w-full py-3 rounded-xl bg-gray-800 text-gray-500 font-semibold text-sm cursor-not-allowed">
            Configure Stripe to activate
          </button>
        ) : (
          <button
            onClick={() => onSubscribe(plan.id, billing)}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition ${
              `bg-gradient-to-r ${gradient} text-white hover:opacity-90`
            } disabled:opacity-50`}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>Subscribe <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const res = await api.get('/billing/plans');
      return res.data.data;
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const res = await api.get('/billing/subscription');
      return res.data.data;
    },
  });

  const { data: invoices = [] } = useQuery<Record<string, unknown>[]>({
    queryKey: ['billing', 'invoices'],
    queryFn: async () => {
      const res = await api.get('/billing/invoices');
      return res.data.data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ planId, interval }: { planId: string; interval: string }) => {
      setLoadingPlan(planId);
      const res = await api.post('/billing/checkout', {
        planId,
        interval,
        successUrl: `${window.location.origin}/billing?success=1`,
        cancelUrl:  `${window.location.origin}/billing?cancel=1`,
      });
      return res.data.data as { url: string };
    },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: () => {
      toast.error('Checkout failed. Check your Stripe configuration.');
      setLoadingPlan(null);
    },
    onSettled: () => setLoadingPlan(null),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/billing/portal', {
        returnUrl: window.location.href,
      });
      return res.data.data as { url: string };
    },
    onSuccess: (data) => { if (data?.url) window.location.href = data.url; },
    onError: () => toast.error('Could not open billing portal'),
  });

  const handleContactSales = () => {
    window.open('mailto:sales@lumorius.com?subject=Enterprise Plan Inquiry', '_blank');
  };

  const currentPlanId = subscription?.plan_id;

  const annualSavings = plans.reduce((s, p) => {
    if (p.id === 'enterprise') return s;
    return s + (p.monthly_price_cents * 12 - p.annual_price_cents);
  }, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-xl">
            <CreditCard className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Billing & Subscriptions</h1>
            <p className="text-gray-400 text-sm">All prices in USD. Cancel anytime.</p>
          </div>
        </div>
        {subscription && (
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-gray-700 rounded-xl text-sm text-gray-300 hover:bg-gray-800 transition"
          >
            <ExternalLink className="w-4 h-4" />
            Manage Billing
          </button>
        )}
      </div>

      {/* Current subscription summary */}
      {subscription && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-violet-500/5 border border-violet-500/20 rounded-2xl p-5 flex flex-wrap gap-6 items-center"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/20 rounded-full flex items-center justify-center">
              {PLAN_ICONS[subscription.plan_id] ?? <CreditCard className="w-5 h-5 text-violet-400" />}
            </div>
            <div>
              <p className="text-sm text-gray-400">Active Plan</p>
              <p className="text-lg font-bold text-white capitalize">{subscription.plan_name}</p>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-700 hidden sm:block" />
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={`text-sm font-semibold capitalize ${
              subscription.status === 'active' ? 'text-emerald-400' : 'text-amber-400'
            }`}>{subscription.status}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Billing</p>
            <p className="text-sm font-semibold text-white capitalize">{subscription.interval}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Renews</p>
            <p className="text-sm font-semibold text-white">
              {subscription.current_period_end
                ? new Date(subscription.current_period_end).toLocaleDateString()
                : '—'}
            </p>
          </div>
          {subscription.cancel_at_period_end && (
            <div className="ml-auto">
              <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20">
                Cancels at period end
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center bg-gray-900 border border-gray-800 rounded-xl p-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              billing === 'monthly' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              billing === 'annual' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Annual
          </button>
        </div>
        {billing === 'annual' && annualSavings > 0 && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full font-medium border border-emerald-500/20">
            Save up to ${(annualSavings / 100).toFixed(0)}/year
          </span>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={currentPlanId === plan.id}
            billing={billing}
            loading={loadingPlan === plan.id && checkoutMutation.isPending}
            onSubscribe={(planId, interval) => checkoutMutation.mutate({ planId, interval })}
            onContactSales={handleContactSales}
          />
        ))}
      </div>

      {/* Security trust badges */}
      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        {[
          { icon: Shield, text: 'Stripe-secured payments' },
          { icon: Check,  text: 'SOC 2 compliant'         },
          { icon: Zap,    text: 'Cancel anytime'           },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2 text-sm text-gray-500">
            <Icon className="w-4 h-4 text-gray-600" />
            {text}
          </div>
        ))}
      </div>

      {/* Invoice history */}
      {invoices.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Invoice History</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-4 font-medium text-gray-500">Date</th>
                  <th className="text-left p-4 font-medium text-gray-500">Amount (USD)</th>
                  <th className="text-left p-4 font-medium text-gray-500">Status</th>
                  <th className="text-left p-4 font-medium text-gray-500">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id as string} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="p-4 text-gray-300">
                      {inv.paid_at
                        ? new Date(inv.paid_at as string).toLocaleDateString()
                        : new Date(inv.created_at as string).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-white font-semibold">
                      ${(Number(inv.amount_cents) / 100).toFixed(2)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                        inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>{inv.status as string}</span>
                    </td>
                    <td className="p-4">
                      {inv.invoice_url && (
                        <a
                          href={inv.invoice_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Download
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
