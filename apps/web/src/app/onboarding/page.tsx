'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Zap, Building2, Users, Brain, Target, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';

const STEPS = [
  { id: 'welcome',   label: 'Welcome',      icon: Zap       },
  { id: 'org',       label: 'Organisation', icon: Building2 },
  { id: 'team',      label: 'Team',         icon: Users     },
  { id: 'brain',     label: 'Company Brain',icon: Brain     },
  { id: 'goals',     label: 'First Goal',   icon: Target    },
  { id: 'done',      label: 'Done',         icon: CheckCircle },
];

export default function OnboardingPage() {
  const router  = useRouter();
  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState({
    orgName:   '',
    orgSize:   '1-10',
    industry:  '',
    invites:   '',
    brainDesc: '',
    goalTitle: '',
  });

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const completeMut = useMutation({
    mutationFn: async () => {
      await api.post('/organizations/onboarding', form);
    },
    onSuccess: () => router.push('/dashboard'),
  });

  const pct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl">Lumorius AI</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{STEPS[step].label}</p>
            <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          {/* Step icons */}
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col items-center gap-1 ${i <= step ? 'opacity-100' : 'opacity-30'}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                    i < step ? 'bg-violet-600' : i === step ? 'bg-violet-600/20 ring-2 ring-violet-600' : 'bg-muted'
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${i <= step ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="bg-card border border-border rounded-2xl p-8"
          >
            {step === 0 && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-violet-500/30">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Welcome to Lumorius AI</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  The AI Operating System for modern businesses. Let&apos;s set up your workspace in under 3 minutes.
                </p>
                <ul className="text-left text-sm space-y-2 max-w-xs mx-auto text-muted-foreground">
                  {['Company Brain (RAG knowledge base)', 'Meeting Intelligence & transcription', 'Founder OS — OKRs, KPIs & health score', 'AI Strategy Advisor'].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-violet-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Tell us about your organisation</h2>
                  <p className="text-sm text-muted-foreground">We&apos;ll personalise your experience.</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Organisation name *</label>
                  <input
                    value={form.orgName}
                    onChange={(e) => setForm((f) => ({ ...f, orgName: e.target.value }))}
                    placeholder="Acme Corp"
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Team size</label>
                    <select
                      value={form.orgSize}
                      onChange={(e) => setForm((f) => ({ ...f, orgSize: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg focus:outline-none"
                    >
                      {['1-10', '11-50', '51-200', '201-500', '500+'].map((s) => (
                        <option key={s} value={s}>{s} people</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Industry</label>
                    <input
                      value={form.industry}
                      onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                      placeholder="SaaS, Fintech, E-commerce…"
                      className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Invite your team</h2>
                  <p className="text-sm text-muted-foreground">You can always do this later.</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Team email addresses</label>
                  <textarea
                    value={form.invites}
                    onChange={(e) => setForm((f) => ({ ...f, invites: e.target.value }))}
                    placeholder="alice@company.com, bob@company.com, charlie@company.com"
                    rows={4}
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Separate multiple emails with commas.</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Describe your Company Brain</h2>
                  <p className="text-sm text-muted-foreground">What should your AI know about your business?</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Business overview</label>
                  <textarea
                    value={form.brainDesc}
                    onChange={(e) => setForm((f) => ({ ...f, brainDesc: e.target.value }))}
                    placeholder="We are a B2B SaaS company building project management tools for remote teams. Our main customers are SMEs in the tech sector…"
                    rows={5}
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  You can upload documents (PDFs, Docs, CSVs) from Company Brain later to enrich your knowledge base.
                </p>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Set your first goal</h2>
                  <p className="text-sm text-muted-foreground">Give your AI strategy advisor context about your #1 priority.</p>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Top priority goal</label>
                  <input
                    value={form.goalTitle}
                    onChange={(e) => setForm((f) => ({ ...f, goalTitle: e.target.value }))}
                    placeholder="Reach $500K ARR by Q4 2025"
                    className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
                <p className="text-muted-foreground">
                  Your Lumorius workspace is ready. Let&apos;s go to your dashboard.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 0 && step < STEPS.length - 1 && (
            <button
              onClick={back}
              className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            onClick={step === STEPS.length - 1 ? () => completeMut.mutate() : next}
            disabled={step === 1 && !form.orgName}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-violet-500/25"
          >
            {step === STEPS.length - 1
              ? completeMut.isPending ? 'Setting up…' : 'Enter Lumorius'
              : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
