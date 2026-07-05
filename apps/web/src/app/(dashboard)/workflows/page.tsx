'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Workflow, Play, Pause, Plus, CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

export default function WorkflowsPage() {
  const queryClient = useQueryClient();

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await api.get('/workflows');
      return res.data.data as Record<string, unknown>[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/workflows/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/trigger`, {}),
    onSuccess: () => toast.success('Workflow triggered manually'),
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 rounded-xl">
            <Workflow className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Automation</h1>
            <p className="text-muted-foreground text-sm">Automate triggers, actions, and notifications</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm hover:bg-brand-600 transition">
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {/* Example workflows */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Example Workflows</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: 'Document Uploaded → Analyze & Notify',
              description: 'When a document is uploaded and indexed, notify the team with a summary.',
              trigger: 'document.indexed',
            },
            {
              title: 'Meeting Completed → Create Tasks',
              description: 'When a meeting analysis is ready, automatically create tasks from action items.',
              trigger: 'meeting.completed',
            },
            {
              title: 'Weekly KPI Report',
              description: 'Every Monday, generate an AI-powered weekly business report.',
              trigger: 'schedule.weekly',
            },
            {
              title: 'Overdue Task → Escalate',
              description: 'When a task passes its due date, notify the manager and escalate priority.',
              trigger: 'task.overdue',
            },
          ].map((ex, i) => (
            <div key={i} className="p-4 border border-border rounded-xl">
              <p className="font-medium text-sm text-foreground">{ex.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{ex.description}</p>
              <span className="inline-block mt-2 text-xs bg-muted px-2 py-0.5 rounded font-mono">{ex.trigger}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Workflows list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !workflows || workflows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Workflow className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No workflows yet. Create your first automation.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workflows.map((wf) => (
            <motion.div
              key={wf.id as string}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl"
            >
              <div className={`w-2 h-2 rounded-full ${wf.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{wf.name as string}</p>
                <p className="text-xs text-muted-foreground">
                  Trigger: {wf.trigger_type as string} · {Number(wf.run_count ?? 0)} runs · {formatRelative(wf.created_at as string)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  {wf.successful_runs as number}
                </span>
                <button
                  onClick={() => triggerMutation.mutate(wf.id as string)}
                  className="p-1.5 rounded-lg hover:bg-muted transition"
                  title="Trigger manually"
                >
                  <Play className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate(wf.id as string)}
                  className="p-1.5 rounded-lg hover:bg-muted transition"
                  title={wf.is_active ? 'Pause workflow' : 'Activate workflow'}
                >
                  {wf.is_active ? (
                    <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-green-500" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
