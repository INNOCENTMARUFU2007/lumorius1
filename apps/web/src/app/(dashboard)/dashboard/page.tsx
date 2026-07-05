'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Brain, Mic, CheckSquare, AlertTriangle, TrendingUp,
  Target, Lightbulb, Clock,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'founder-dashboard'],
    queryFn: async () => {
      const res = await api.get('/analytics/founder-dashboard');
      return res.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const tasks = summary?.tasks;
  const docs = summary?.documents;
  const meetings = summary?.meetings;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what needs your attention today.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Open Tasks"
          value={tasks?.total ? Number(tasks.total) - Number(tasks.completed) : 0}
          subtitle={`${tasks?.urgent_open ?? 0} urgent · ${tasks?.overdue ?? 0} overdue`}
          icon={CheckSquare}
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          title="Documents Indexed"
          value={docs?.indexed ?? 0}
          subtitle={`${docs?.uploaded_this_week ?? 0} uploaded this week`}
          icon={Brain}
          color="bg-purple-500/10 text-purple-500"
        />
        <StatCard
          title="Meetings Analyzed"
          value={meetings?.completed ?? 0}
          subtitle={`${meetings?.last_30_days ?? 0} in last 30 days`}
          icon={Mic}
          color="bg-green-500/10 text-green-500"
        />
        <StatCard
          title="Active Goals"
          value={data?.goals?.filter((g: { status: string }) => g.status === 'active').length ?? 0}
          subtitle="Track your strategic objectives"
          icon={Target}
          color="bg-orange-500/10 text-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Tasks */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-orange-500" />
            <h3 className="font-semibold text-foreground">Urgent & Overdue Tasks</h3>
          </div>
          {data?.urgentTasks?.length === 0 ? (
            <p className="text-sm text-muted-foreground">All tasks are on track</p>
          ) : (
            <div className="space-y-2">
              {data?.urgentTasks?.slice(0, 5).map((task: Record<string, unknown>) => (
                <div key={task.id as string} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${task.priority === 'urgent' ? 'bg-red-500' : 'bg-orange-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{task.title as string}</p>
                    {task.due_date && (
                      <p className="text-xs text-muted-foreground">Due {formatRelative(task.due_date as string)}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                    task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400'
                  }`}>{task.priority as string}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Risks */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <h3 className="font-semibold text-foreground">AI-Detected Risks</h3>
          </div>
          {data?.risks?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No significant risks detected</p>
          ) : (
            <div className="space-y-3">
              {data?.risks?.slice(0, 3).map((risk: Record<string, string>, i: number) => (
                <div key={i} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize font-medium ${
                      risk.severity === 'critical' ? 'bg-red-100 text-red-700'
                      : risk.severity === 'high' ? 'bg-orange-100 text-orange-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>{risk.severity}</span>
                    <p className="text-sm font-medium text-foreground">{risk.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{risk.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Opportunities */}
      {data?.opportunities?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold text-foreground">AI-Detected Opportunities</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data.opportunities.slice(0, 3).map((opp: Record<string, string>, i: number) => (
              <div key={i} className="p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-600 font-medium capitalize">{opp.impact} impact</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{opp.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{opp.nextStep}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
