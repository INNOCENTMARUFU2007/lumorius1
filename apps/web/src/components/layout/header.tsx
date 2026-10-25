
'use client';

import Link from 'next/link';
import { Bell, Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { CommandPalette } from '@/components/command-palette';
import type { AuthUser } from '@/lib/auth';
import api from '@/lib/api';

interface HeaderProps {
  user?: AuthUser | null;
}

function parseUnreadCount(responseData: unknown): number {
  let payload: unknown = responseData;

  // Support API responses wrapped in data, including nested wrappers.
  for (let i = 0; i < 3; i += 1) {
    if (!payload || typeof payload !== 'object') {
      break;
    }

    const record = payload as Record<string, unknown>;

    if ('count' in record) {
      const count = Number(record.count);

      return Number.isFinite(count)
        ? Math.max(0, Math.floor(count))
        : 0;
    }

    if ('unreadCount' in record) {
      const count = Number(record.unreadCount);

      return Number.isFinite(count)
        ? Math.max(0, Math.floor(count))
        : 0;
    }

    if (!('data' in record)) {
      break;
    }

    payload = record.data;
  }

  return 0;
}

export function Header({ user }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/notifications/unread-count',
      );

      return parseUnreadCount(response.data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const displayName =
    user?.name?.trim() ||
    user?.email?.trim() ||
    'User';

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/80 px-6 backdrop-blur-sm">
      <div className="max-w-sm flex-1">
        <CommandPalette />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/notifications"
          className="relative rounded-lg p-2 transition hover:bg-accent"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          title={
            unreadCount > 0
              ? `${unreadCount} unread notifications`
              : 'Notifications'
          }
        >
          <Bell className="h-4 w-4 text-muted-foreground" />

          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() =>
            setTheme(theme === 'dark' ? 'light' : 'dark')
          }
          className="rounded-lg p-2 transition hover:bg-accent"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {user && (
          <div className="ml-2 flex items-center gap-2 border-l border-border pl-2">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={`${displayName}'s avatar`}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white"
                aria-hidden="true"
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="hidden sm:block">
              <p className="text-xs font-medium text-foreground">
                {displayName}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {user.role}
              </p>
            </div>

            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="ml-1 rounded-lg p-1.5 transition hover:bg-accent disabled:opacity-50"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
