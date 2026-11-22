'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsLeft, ChevronsRight, Download, Lock, X } from 'lucide-react';
import { routeAccess, usePlan } from '@/hooks/use-plan';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { ADMIN_ITEMS, NAV_GROUPS, WORKSPACE_ITEMS, isActiveRoute, type NavItem } from '@/lib/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

async function exportMyData() {
  try {
    const response = await api.get('/gdpr/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lumorius-data-export.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    const failure = error as { message?: string; response?: { status?: number; data?: Blob } };
    let details = failure.message || 'Unknown error';
    if (failure.response?.data instanceof Blob) {
      const body = await failure.response.data.text();
      try {
        const parsed = JSON.parse(body);
        details = parsed.message || body || details;
      } catch {
        details = body || details;
      }
    }
    console.error('GDPR data export failed:', { status: failure.response?.status, details, error });
    window.alert(`Data export failed (HTTP ${failure.response?.status || 'network error'}): ${details}`);
  }
}

function NavLink({
  item,
  active,
  collapsed,
  badge,
  tone = 'primary',
  onNavigate,
  locked = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  tone?: 'primary' | 'critical';
  onNavigate?: () => void;
  /** Not included in the workspace plan; still navigable so the upgrade page explains why. */
  locked?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? (badge ? `${item.label}, ${badge} unread` : item.label) : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-2.5 rounded-lg text-sm font-medium outline-none transition-colors duration-150',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active
          ? tone === 'critical'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full',
            tone === 'critical' ? 'bg-destructive' : 'bg-primary',
          )}
        />
      )}
      <Icon
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          active ? (tone === 'critical' ? 'text-destructive' : 'text-primary') : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      {!collapsed && <span className={cn('truncate', locked && 'opacity-60')}>{item.label}</span>}
      {!collapsed && locked && <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Not in your plan" />}
      {badge ? (
        <span
          aria-label={collapsed ? undefined : `${badge} unread`}
          className={cn(
            'flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground',
            collapsed ? 'absolute right-1 top-1 h-3.5 min-w-3.5 text-xs' : 'ml-auto',
          )}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-elevated group-hover:block group-focus-visible:block"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: plan } = usePlan();

  const platformAdminEmail = (process.env.NEXT_PUBLIC_LUMORIUS_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const isAdmin = Boolean(platformAdminEmail && (user?.email ?? '').trim().toLowerCase() === platformAdminEmail);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await api.get('/notifications/unread-count');
      const payload = response.data?.data ?? response.data;
      const count = Number(payload?.count ?? payload?.unreadCount ?? 0);
      return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onMobileClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  // On mobile the drawer always shows labels.
  const renderNav = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      <div className={cn('flex h-14 shrink-0 items-center border-b border-border', isCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
        <Link href="/dashboard" aria-label="Lumorius home" className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring">
          {/* Icon from the brand asset; wordmark rendered as text so it follows the theme. */}
          <Image src="/favicon.svg" alt="" width={28} height={28} priority className="h-7 w-7 shrink-0" />
          {!isCollapsed && (
            <span className="min-w-0 leading-none">
              <span className="block text-[15px] font-semibold tracking-tight text-foreground">Lumorius</span>
              <span className="mt-1 block text-xs font-medium  text-muted-foreground">Enterprise AI</span>
            </span>
          )}
        </Link>
        {onNavigate && (
          <button type="button" onClick={onMobileClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav aria-label="Primary" className={cn('flex-1 space-y-5 overflow-y-auto py-4', isCollapsed ? 'px-2' : 'px-3')}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {isCollapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
            ) : (
              <p className="lm-eyebrow mb-1.5 px-2.5 text-xs">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActiveRoute(pathname, item.href)}
                  collapsed={isCollapsed}
                  badge={item.href === '/notifications' && unreadCount > 0 ? unreadCount : undefined}
                  onNavigate={onNavigate}
                  locked={!routeAccess(item.href, plan).allowed}
                />
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            {isCollapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
            ) : (
              <p className="lm-eyebrow mb-1.5 px-2.5 text-xs text-destructive/80">Platform</p>
            )}
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} active={isActiveRoute(pathname, item.href)} collapsed={isCollapsed} tone="critical" onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className={cn('space-y-0.5 border-t border-border py-3', isCollapsed ? 'px-2' : 'px-3')}>
        {WORKSPACE_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActiveRoute(pathname, item.href)} collapsed={isCollapsed} onNavigate={onNavigate} />
        ))}
        <button
          type="button"
          onClick={exportMyData}
          title={isCollapsed ? 'Export my data' : undefined}
          aria-label={isCollapsed ? 'Export my data' : undefined}
          className={cn(
            'flex h-9 w-full items-center gap-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            isCollapsed ? 'justify-center' : 'px-2.5',
          )}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!isCollapsed && 'Export my data'}
        </button>
        {!onNavigate && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
            className={cn(
              'mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              isCollapsed ? 'justify-center' : 'px-2.5',
            )}
          >
            {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!isCollapsed && 'Collapse'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop / tablet rail */}
      <aside
        className={cn(
          'lm-glass relative z-30 hidden h-full shrink-0 flex-col border-r border-border transition-[width] duration-200 ease-out-expo lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        {renderNav(collapsed)}
      </aside>

      {/* Mobile drawer */}
      <div className={cn('fixed inset-0 z-50 lg:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <div
          className={cn('absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={onMobileClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            'absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-card shadow-elevated transition-transform duration-200 ease-out-expo',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {mobileOpen && renderNav(false, onMobileClose)}
        </aside>
      </div>
    </>
  );
}
