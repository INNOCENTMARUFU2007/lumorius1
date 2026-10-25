
'use client';

import Link from 'next/link';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle,
  Zap,
  CreditCard,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  body?: string | null;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

const TYPE_META: Record<
  string,
  { icon: typeof Info; color: string; bg: string }
> = {
  info: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  success: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
  billing: {
    icon: CreditCard,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  security: {
    icon: ShieldAlert,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
  ai: {
    icon: Zap,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
  },
  system: {
    icon: Bell,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  task_assigned: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
};

function parseNotifications(payload: unknown): NotificationItem[] {
  let current = payload;

  for (let i = 0; i < 3; i += 1) {
    if (Array.isArray(current)) {
      return current.filter(
        (item): item is NotificationItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as NotificationItem).id === 'string',
      );
    }

    if (!current || typeof current !== 'object') {
      return [];
    }

    const record = current as Record<string, unknown>;

    if (Array.isArray(record.notifications)) {
      current = record.notifications;
      continue;
    }

    if ('data' in record) {
      current = record.data;
      continue;
    }

    return [];
  }

  return Array.isArray(current) ? current as NotificationItem[] : [];
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications', {
        params: { limit: 50 },
      });

      return parseNotifications(response.data);
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const refreshNotifications = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['notifications'] }),
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
    ]);
  };

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: refreshNotifications,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: refreshNotifications,
  });

  // Only enable deletion if the backend provides DELETE /notifications/:id.
  const deleteNotif = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/notifications/${encodeURIComponent(id)}`),
    onSuccess: refreshNotifications,
  });

  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

  const mutationError =
    markAllRead.isError || markRead.isError || deleteNotif.isError;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="rounded-xl bg-violet-500/10 p-2.5">
              <Bell className="h-6 w-6 text-violet-500" />
            </div>

            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Refresh notifications"
            aria-label="Refresh notifications"
            className="rounded-lg border border-border p-2 transition hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              {markAllRead.isPending ? 'Updating...' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {mutationError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500"
        >
          An action failed. Check that the corresponding notifications API
          endpoint exists, then try again.
        </div>
      )}

      {isError ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="font-medium">Could not load notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your connection and API, then retry.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-border bg-card p-4"
              >
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/2 rounded bg-muted" />
                    <div className="h-3 w-3/4 rounded bg-muted" />
                  </div>
                </div>
              </div>
            ))
          ) : notifications.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <Bell className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="font-medium">No notifications yet</p>
              <p className="mt-1 text-sm">
                AI insights, billing alerts, security events, and other
                notifications will appear here.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {notifications.map((notification) => {
                const meta =
                  TYPE_META[notification.type] ?? TYPE_META.info;
                const Icon = meta.icon;
                const isUnread = !notification.read_at;
                const isUpdating =
                  markRead.isPending &&
                  markRead.variables === notification.id;
                const message =
                  notification.message ?? notification.body;
                const actionUrl =
                  typeof notification.action_url === 'string' &&
                  notification.action_url.startsWith('/') &&
                  !notification.action_url.startsWith('//')
                    ? notification.action_url
                    : null;

                return (
                  <motion.div
                    key={notification.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      isUnread
                        ? 'border-violet-500/30 bg-violet-500/[0.03]'
                        : 'border-border bg-card hover:bg-muted/20'
                    }`}
                    onClick={() => {
                      if (isUnread && !markRead.isPending) {
                        markRead.mutate(notification.id);
                      }
                    }}
                  >
                    {isUnread && (
                      <span className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full bg-violet-500" />
                    )}

                    <div
                      className={`shrink-0 rounded-lg p-2 ${meta.bg}`}
                    >
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          isUnread ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        {notification.title || 'Notification'}
                      </p>

                      {message && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {message}
                        </p>
                      )}

                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {notification.created_at
                          ? formatRelative(notification.created_at)
                          : ''}
                      </p>
{actionUrl && (
  <Link
    href={actionUrl}
    onClick={(event) => {
      event.stopPropagation();
      if (isUnread) {
        markRead.mutate(notification.id);
      }
    }}
    className="mt-2 inline-flex items-center rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-500 transition hover:bg-violet-500/10"
  >
    {notification.type === 'billing' ? 'Review billing' : 'Open'}
  </Link>
)}

                      {isUpdating && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Marking as read...
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {isUnread && (
                        <button
                          type="button"
                          title="Mark as read"
                          aria-label={`Mark ${notification.title} as read`}
                          disabled={markRead.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            markRead.mutate(notification.id);
                          }}
                          className="rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <CheckCheck className="h-4 w-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        title="Delete notification"
                        aria-label={`Delete ${notification.title}`}
                        disabled={deleteNotif.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteNotif.mutate(notification.id);
                        }}
                        className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}
