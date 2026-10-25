'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckSquare, Plus, Circle, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all');
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? { status: filter, pageSize: 100 } : { pageSize: 100 };
      const res = await api.get('/tasks', { params });
      return res.data.data;
    },
  });

  const createMutation = useMutation({
  mutationFn: () =>
    api.post('/tasks', {
      title: newTitle.trim(),
      priority: newPriority,
    }),

  onSuccess: async () => {
    toast.success('Task created');
    setNewTitle('');
    setShowNew(false);

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['analytics'],
      }),
    ]);
  },

  onError: (error: any) => {
    const message =
      error?.response?.data?.message ?? 'Failed to create task';

    toast.error(
      Array.isArray(message) ? message.join(', ') : message
    );
  },
});

  const updateMutation = useMutation({
  mutationFn: ({ id, status }: { id: string; status: string }) =>
    api.patch(`/tasks/${id}`, { status }),

  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['analytics'],
      }),
    ]);
  },

  onError: () => {
    toast.error('Failed to update task status');
  },
});

  const tasks: Record<string, unknown>[] = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl">
            <CheckSquare className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tasks & Projects</h1>
            <p className="text-muted-foreground text-sm">{data?.total ?? 0} total tasks</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'todo', 'in_progress', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
              filter === f ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* New task form */}
      {showNew && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-brand-500/50 rounded-xl p-4 flex gap-3"
        >
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newTitle.trim() && createMutation.mutate()}
            placeholder="Task title…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder-muted-foreground"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1 bg-card"
          >
            {['urgent', 'high', 'medium', 'low'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            onClick={() => newTitle.trim() && createMutation.mutate()}
            className="px-3 py-1.5 bg-brand-500 text-white rounded-lg text-xs font-medium hover:bg-brand-600 transition"
          >
            Add
          </button>
          <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground transition text-xs">
            Cancel
          </button>
        </motion.div>
      )}

      {/* Tasks */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => {
            const StatusIcon = STATUS_ICONS[task.status as string] ?? Circle;
            const isDone = task.status === 'done';
            return (
              <motion.div
                key={task.id as string}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:shadow-sm transition group"
              >
                <button
                  onClick={() => updateMutation.mutate({
                    id: task.id as string,
                    status: isDone ? 'todo' : 'done',
                  })}
                  className="shrink-0"
                >
                  <StatusIcon className={`w-5 h-5 transition ${isDone ? 'text-green-500' : 'text-muted-foreground hover:text-brand-500'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title as string}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {Boolean(task.project_name) && (
                      <span className="text-xs text-muted-foreground">{task.project_name as string}</span>
                    )}
                    {Boolean(task.due_date) && (
                      <span className={`text-xs ${new Date(task.due_date as string) < new Date() && !isDone ? 'text-red-500' : 'text-muted-foreground'}`}>
                        Due {formatDate(task.due_date as string)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {Boolean(task.assignee_name) && (
                    <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center text-xs text-brand-600 font-medium">
                      {(task.assignee_name as string).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[task.priority as string] ?? ''}`}>
                    {task.priority as string}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
