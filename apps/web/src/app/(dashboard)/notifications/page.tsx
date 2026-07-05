'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, CheckCheck, Trash2, AlertTriangle, Info,
  CheckCircle, Zap, CreditCard, ShieldAlert,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  info:     { icon: Info,         color: 'text-blue-500',   bg: 'bg-blue-500/10'   },
  success:  { icon: CheckCircle,  color: 'text-green-500',  bg: 'bg-green-500/10'  },
  warning:  { icon: AlertTriangle,color: 'text-amber-500',  bg: 'bg-amber-500/10'  },
  error:    { icon: AlertTriangle,color: 'text-red-500',    bg: 'bg-red-500/10'    },
  billing:  { icon: CreditCard,   color: 'text-violet-500', bg: 'bg-violet-500/10' },
  security: { icon: ShieldAlert,  color: 'text-red-500',    bg: 'bg-red-500/10'    },
  ai:       { icon: Zap,          color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
};

export default function NotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications?limit=50')).data.data,
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = (data ?? []) as Record<string, unknown>[];
  const unreadCount   = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 bg-violet-500/10 rounded-xl">
              <Bell className="w-6 h-6 text-violet-500" />
            </div>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))
          : notifications.length === 0
            ? (
              <div className="text-center py-20 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No notifications yet</p>
                <p className="text-sm mt-1">You will see AI insights, billing alerts, and security events here.</p>
              </div>
            )
            : (
              <AnimatePresence initial={false}>
                {notifications.map((n) => {
                  const meta = TYPE_META[n.type as string] ?? TYPE_META.info;
                  const Icon = meta.icon;
                  const isUnread = !n.read_at;
                  return (
                    <motion.div
                      key={n.id as string}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`relative flex items-start gap-3 p-4 bg-card border rounded-xl transition-colors cursor-pointer group ${
                        isUnread ? 'border-violet-500/30 bg-violet-500/[0.03]' : 'border-border hover:bg-muted/20'
                      }`}
                      onClick={() => isUnread && markRead.mutate(n.id as string)}
                    >
                      {isUnread && (
                        <span className="absolute top-4 left-4 w-1.5 h-1.5 rounded-full bg-violet-500" />
                      )}
                      <div className={`p-2 rounded-lg shrink-0 ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                          {n.title as string}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body as string}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {formatRelative(n.created_at as string)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotif.mutate(n.id as string); }}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
      </div>
    </div>
  );
}
