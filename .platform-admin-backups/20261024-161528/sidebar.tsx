
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Brain,
  Mic,
  CheckSquare,
  Network,
  BarChart3,
  Workflow,
  Sparkles,
  CreditCard,
  Settings,
  TrendingUp,
  ShieldCheck,
  Users,
  Bell,
  Puzzle,
  ShieldAlert,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';

const navGroups = [
  {
    label: 'Platform',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/brain', label: 'Company Brain', icon: Brain },
      { href: '/meetings', label: 'Meetings', icon: Mic },
      { href: '/tasks', label: 'Tasks & Projects', icon: CheckSquare },
      { href: '/knowledge', label: 'Knowledge Graph', icon: Network },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/founder-os', label: 'Founder OS', icon: TrendingUp },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/workflows', label: 'Workflows', icon: Workflow },
      { href: '/ai', label: 'AI Advisor', icon: Sparkles },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/team', label: 'Team Members', icon: Users },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/integrations', label: 'Integrations', icon: Puzzle },
    ],
  },
];

const bottomItems = [
  { href: '/security', label: 'Security', icon: ShieldCheck },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const adminItems = [
  { href: '/admin', label: 'Admin Panel', icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isAdmin =
    user?.role === 'admin' || user?.role === 'super_admin';

  // Retrieve the real unread count instead of displaying a fixed badge.
  const {
    data: unreadCount = 0,
  } = useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await api.get('/notifications/unread-count');

      const payload = response.data?.data ?? response.data;
      const countValue =
        payload?.count ?? payload?.unreadCount ?? 0;

      const count = Number(countValue);

      return Number.isFinite(count)
        ? Math.max(0, Math.floor(count))
        : 0;
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });

  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link
          href="/dashboard"
          aria-label="Lumorius home"
          className="flex items-center justify-center"
        >
          <Image
            src="/logo-horizontal.svg"
            alt="Lumorius AI — INMARTECH"
            width={320}
            height={80}
            priority
            className="h-auto w-full max-w-[190px] object-contain"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
              {group.label}
            </p>

            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
                      active
                        ? 'bg-violet-500/10 text-violet-500 dark:text-violet-400'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-500 rounded-r-full" />
                    )}

                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        active
                          ? 'text-violet-500'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />

                    <span>{label}</span>

                    {href === '/notifications' && unreadCount > 0 && (
                      <span
                        aria-label={`${unreadCount} unread notifications`}
                        className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white"
                      >
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
              Admin
            </p>

            <div className="space-y-0.5">
              {adminItems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-red-500/10 text-red-500'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom navigation */}
      <div className="p-3 border-t border-border space-y-0.5">
        {bottomItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-violet-500/10 text-violet-500'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* GDPR data export */}
        <a
          href="/api/v1/gdpr/export"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
          download
        >
          <Download className="w-4 h-4 shrink-0" />
          Export My Data
        </a>
      </div>
    </aside>
  );
}
