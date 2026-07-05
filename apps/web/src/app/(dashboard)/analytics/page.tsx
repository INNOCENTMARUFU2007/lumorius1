'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Users, Target, Plus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function AnalyticsPage() {
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['analytics', 'founder-dashboard'],
    queryFn: async () => {
      const res = await api.get('/analytics/founder-dashboard');
      return res.data.data;
    },
  });

  const { data: team } = useQuery({
    queryKey: ['analytics', 'team'],
    queryFn: async () => {
      const res = await api.get('/analytics/team-dashboard');
      return res.data.data;
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ['analytics', 'kpis'],
    queryFn: async () => {
      const res = await api.get('/analytics/kpis');
      return res.data.data as Record<string, unknown>[];
    },
  });

  const weeklyReportMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/analytics/reports/weekly');
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success('Weekly report generated');
      const blob = new Blob([data.content as string], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lumorius-weekly-report-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
    },
    onError: () => toast.error('Failed to generate report. Check AI provider settings.'),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const members: Record<string, unknown>[] = team?.members ?? [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-xl">
            <BarChart3 className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Analytics & Founder OS</h1>
            <p className="text-muted-foreground text-sm">Business intelligence and performance metrics</p>
          </div>
        </div>
        <button
          onClick={() => weeklyReportMutation.mutate()}
          disabled={weeklyReportMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm hover:bg-brand-600 transition disabled:opacity-50"
        >
          {weeklyReportMutation.isPending ? 'Generating…' : '📊 Generate Weekly Report'}
        </button>
      </div>

      {/* Goals */}
      {dashboard?.goals && dashboard.goals.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-orange-500" />
            <h3 className="font-semibold">Active Goals</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.goals.slice(0, 6).map((goal: Record<string, unknown>) => {
              const progress = goal.target_value && goal.current_value
                ? Math.min(100, (Number(goal.current_value) / Number(goal.target_value)) * 100)
                : 0;
              return (
                <div key={goal.id as string} className="p-4 border border-border rounded-xl">
                  <p className="font-medium text-sm text-foreground">{goal.title as string}</p>
                  {goal.due_date && (
                    <p className="text-xs text-muted-foreground mt-0.5">Due {formatDate(goal.due_date as string)}</p>
                  )}
                  {goal.target_value && (
                    <>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{goal.current_value as number ?? 0} {goal.unit as string}</span>
                        <span>{goal.target_value as number} {goal.unit as string}</span>
                      </div>
                      <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      {kpis && kpis.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold">KPI Metrics</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {kpis.slice(0, 4).map((kpi) => {
              const history = (kpi.history as Array<Record<string, unknown>> ?? []).reverse();
              const current = Number(kpi.current_value ?? 0);
              const prev = Number(kpi.previous_value ?? current);
              const change = prev !== 0 ? ((current - prev) / prev) * 100 : 0;
              return (
                <div key={kpi.id as string} className="p-4 border border-border rounded-xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.name as string}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">
                        {current.toLocaleString()} {kpi.unit as string}
                      </p>
                    </div>
                    {change !== 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {change > 0 ? '+' : ''}{change.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {history.length > 1 && (
                    <div className="mt-3 h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#6366f1"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Productivity */}
      {members.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold">Team Productivity</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={members.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 12 }}
                  width={100}
                />
                <Tooltip />
                <Bar dataKey="tasks_completed_this_week" name="Done this week" fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="open_tasks" name="Open tasks" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
