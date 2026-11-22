'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AccountActions } from './account-actions';
import { Bell, ChevronRight, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import { CommandPalette } from '@/components/command-palette';
import type { AuthUser } from '@/lib/auth';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { resolveRoute } from '@/lib/navigation';

interface HeaderProps {
  user?: AuthUser | null;
  onOpenMobileNav: () => void;
}

function parseUnreadCount(responseData: unknown): number {
  let payload: unknown = responseData;
  // Support API responses wrapped in data, including nested wrappers.
  for (let i = 0; i < 3; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    const record = payload as Record<string, unknown>;
    if ('count' in record || 'unreadCount' in record) {
      const count = Number(record.count ?? record.unreadCount);
      return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }
    if (!('data' in record)) break;
    payload = record.data;
  }
  return 0;
}

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const Current = !mounted ? Moon : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Theme"
      >
        <Current className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Theme" className="lm-enter absolute right-0 top-11 z-50 w-36 rounded-xl border border-border bg-popover p-1 shadow-elevated">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                theme === value ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header({ user, onOpenMobileNav }: HeaderProps) {
  const pathname = usePathname();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const { crumbs, item } = resolveRoute(pathname);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    enabled: Boolean(user),
    queryFn: async () => parseUnreadCount((await api.get<unknown>('/notifications/unread-count')).data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const displayName = user?.name?.trim() || user?.email?.trim() || 'User';

  return (
    <header className="lm-glass sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">{crumb.label}</Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={cn('truncate', last ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {item && <span className="truncate text-sm font-medium md:hidden">{item.label}</span>}

      <div className="ml-auto flex min-w-0 items-center gap-1">
        <div className="mr-1 min-w-0">
          <CommandPalette />
        </div>

        <Link
          href="/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <ThemeSelector />

        {user && (
          <div className="ml-1 flex items-center gap-2 border-l border-border pl-2 sm:pl-3">
            {user.avatarUrl && failedPhoto !== user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                referrerPolicy="no-referrer"
                onError={() => setFailedPhoto(user.avatarUrl ?? null)}
                alt={`${displayName}'s avatar`}
                className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-border" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden max-w-40 xl:block">
              <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
            </div>
            <AccountActions user={user} />
          </div>
        )}
      </div>
    </header>
  );
}
