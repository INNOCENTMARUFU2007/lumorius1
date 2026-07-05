'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, Target, Activity, Plus, ChevronRight,
  AlertTriangle, CheckCircle, Zap, BarChart2, Users,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';

const SCORE_COLOR = (s: number) =>
  s >= 75 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color = SCORE_COLOR(score);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{score}</span>
        </div>
      </div>
      <span className="text-xs text-gray-400 text-center">{label}</span>
    </div>
  );
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  on_track:  { label: 'On Track',  color: 'bg-emerald-500/20 text-emerald-400' },
  at_risk:   { label: 'At Risk',   color: 'bg-amber-500/20   text-amber-400'   },
  behind:    { label: 'Behind',    color: 'bg-red-500/20     text-red-400'     },
  completed: { label: 'Completed', color: 'bg-blue-500/20    text-blue-400'    },
};

function OkrCard({ obj }: { obj: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_MAP[obj.status as string] ?? STATUS_MAP.on_track;
  const krs = (obj.key_results as Record<string, unknown>[]) ?? [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/50 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Target className="w-5 h-5 text-violet-400 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{obj.title as string}</p>
            <p className="text-xs text-gray-400 mt-0.5">{obj.quarter as string} {obj.year as number}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
            {status.label}
          </span>
          <div className="w-16 bg-gray-800 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-violet-500 transition-all"
              style={{ width: `${obj.progress as number}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 w-8 text-right">{obj.progress as number}%</span>
          <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && krs.length > 0 && (
        <div className="border-t border-gray-800 p-4 space-y-3">
          {krs.map((kr) => (
            <div key={kr.id as string} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate">{kr.title as string}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-800 rounded-full h-1">
                    <div
                      className="h-1 rounded-full bg-violet-500"
                      style={{ width: `${kr.progress as number}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {kr.current_value as number} / {kr.target_value as number} {kr.unit as string ?? ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FounderOsPage() {
  const qc = useQueryClient();
  const [showNewOkr, setShowNewOkr] = useState(false);
  const [newOkrTitle, setNewOkrTitle] = useState('');

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['founder-os', 'dashboard'],
    queryFn: async () => {
      const res = await api.get('/founder-os/dashboard');
      return res.data.data as Record<string, unknown>;
    },
  });

  const createOkr = useMutation({
    mutationFn: async (title: string) => {
      const quarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
      const res = await api.post('/founder-os/okrs', {
        title,
        quarter,
        year: new Date().getFullYear(),
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Objective created!');
      qc.invalidateQueries({ queryKey: ['founder-os'] });
      setShowNewOkr(false);
      setNewOkrTitle('');
    },
  });

  const health = (dashboard?.healthScore as Record<string, number>) ?? {};
  const okrs = ((dashboard?.okrs as Record<string, unknown>)?.objectives as Record<string, unknown>[]) ?? [];
  const kpis = (dashboard?.kpis as Record<string, unknown>[]) ?? [];
  const teamVelocity = (dashboard?.teamVelocity as Record<string, unknown>[]) ?? [];
  const taskBreakdown = (dashboard?.taskBreakdown as Record<string, unknown>[]) ?? [];
  const insights = (dashboard?.aiInsights as Record<string, unknown>) ?? {};

  const radarData = [
    { subject: 'Financial', A: health.financial ?? 0 },
    { subject: 'Growth',    A: health.growth    ?? 0 },
    { subject: 'Team',      A: health.team      ?? 0 },
    { subject: 'Product',   A: health.product   ?? 0 },
  ];

  const taskPieData = taskBreakdown.reduce((acc: Record<string, number>, row) => {
    acc[row.status as string] = (acc[row.status as string] ?? 0) + Number(row.count);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-xl">
            <TrendingUp className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Founder OS</h1>
            <p className="text-gray-400 text-sm">Business intelligence & OKR command centre</p>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {dashboard?.quarter as string} {dashboard?.year as number} · Updated {new Date().toLocaleDateString()}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Health Score */}
          <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-violet-400" />
              <h2 className="font-semibold text-white">Business Health Score</h2>
              <span className={`ml-auto text-2xl font-black`} style={{ color: SCORE_COLOR(health.overall ?? 0) }}>
                {health.overall ?? 0}/100
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Radar dataKey="A" fill="#7c3aed" fillOpacity={0.3} stroke="#7c3aed" strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-4 items-center">
                <ScoreRing score={health.financial ?? 0} label="Financial" />
                <ScoreRing score={health.growth    ?? 0} label="Growth"    />
                <ScoreRing score={health.team      ?? 0} label="Team"      />
                <ScoreRing score={health.product   ?? 0} label="Product"   />
              </div>
            </div>
          </section>

          {/* AI Insights */}
          {insights?.insights && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(insights.insights as Record<string, string>[]).map((ins, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`p-4 rounded-xl border ${
                    ins.type === 'strength'    ? 'bg-emerald-500/5 border-emerald-500/20' :
                    ins.type === 'warning'     ? 'bg-amber-500/5   border-amber-500/20'   :
                                                 'bg-violet-500/5  border-violet-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {ins.type === 'strength'    ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                     ins.type === 'warning'     ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
                                                  <Zap className="w-4 h-4 text-violet-400" />}
                    <span className="text-sm font-semibold text-white">{ins.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{ins.description}</p>
                </motion.div>
              ))}
            </section>
          )}

          {/* OKRs */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-white">
                  OKRs — {dashboard?.quarter as string} {dashboard?.year as number}
                </h2>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                  {okrs.length} objectives
                </span>
              </div>
              <button
                onClick={() => setShowNewOkr(!showNewOkr)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition"
              >
                <Plus className="w-4 h-4" /> New Objective
              </button>
            </div>

            {showNewOkr && (
              <div className="mb-4 flex gap-2">
                <input
                  className="flex-1 bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-violet-500"
                  placeholder="Objective title..."
                  value={newOkrTitle}
                  onChange={(e) => setNewOkrTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && newOkrTitle && createOkr.mutate(newOkrTitle)}
                  autoFocus
                />
                <button
                  onClick={() => newOkrTitle && createOkr.mutate(newOkrTitle)}
                  disabled={!newOkrTitle || createOkr.isPending}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition"
                >
                  Create
                </button>
              </div>
            )}

            <div className="space-y-3">
              {okrs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No objectives for this quarter yet.</p>
                  <button
                    onClick={() => setShowNewOkr(true)}
                    className="mt-3 text-violet-400 text-sm hover:text-violet-300"
                  >
                    Create your first objective →
                  </button>
                </div>
              ) : (
                okrs.map((obj) => <OkrCard key={obj.id as string} obj={obj} />)
              )}
            </div>
          </section>

          {/* KPIs + Team Velocity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* KPI Snapshot */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-white">KPI Snapshot</h2>
              </div>
              {kpis.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No KPI data recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {kpis.slice(0, 6).map((kpi) => (
                    <div key={kpi.metric_key as string} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate capitalize">
                          {(kpi.metric_key as string).replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-gray-500">Today: {kpi.today ?? '—'}</p>
                      </div>
                      {kpi.today && kpi.last_week && (
                        <span className={`text-xs font-medium ${
                          Number(kpi.today) >= Number(kpi.last_week)
                            ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {Number(kpi.today) >= Number(kpi.last_week) ? '↑' : '↓'}
                          {Math.abs(((Number(kpi.today) - Number(kpi.last_week)) / (Number(kpi.last_week) || 1)) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Team Velocity */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-white">Team Velocity</h2>
                <span className="text-xs text-gray-500 ml-auto">Tasks completed / week</span>
              </div>
              {teamVelocity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No velocity data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={teamVelocity} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={false} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                      labelStyle={{ color: '#9ca3af' }}
                      itemStyle={{ color: '#a78bfa' }}
                    />
                    <Area
                      type="monotone" dataKey="completed"
                      stroke="#7c3aed" strokeWidth={2}
                      fill="url(#velGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          {/* Task Breakdown */}
          {Object.keys(taskPieData).length > 0 && (
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-4">Task Status Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(taskPieData).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <p className="text-3xl font-bold text-white">{count}</p>
                    <p className="text-xs text-gray-400 mt-1 capitalize">{status.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
