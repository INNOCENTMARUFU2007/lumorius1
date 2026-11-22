import {
  LayoutDashboard,
  ClipboardList,
  Brain,
  Mic,
  CheckSquare,
  Network,
  BarChart3,
  Gauge,
  Workflow,
  MessageSquareText,
  Bot,
  CreditCard,
  Settings,
  TrendingUp,
  ShieldCheck,
  Users,
  Bell,
  Puzzle,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short description used for the top bar subtitle and command palette. */
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for customer-facing navigation. Every entry maps to an
 * implemented route in `src/app/(dashboard)`. Deferred modules (for example
 * Business Twin) are intentionally absent and remain reachable only by plan-gated URL.
 * Platform administration is NOT listed here — it is appended by the sidebar only
 * for platform administrators and never appears in the command palette.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Executive command centre' },
      { href: '/chief-of-staff', label: 'Chief of Staff', icon: ClipboardList, description: 'Priorities, commitments and briefings' },
      { href: '/brain', label: 'Company Brain', icon: Brain, description: 'Organizational knowledge and documents' },
      { href: '/executive-intelligence', label: 'Executive Intelligence', icon: Gauge, description: 'Financial and operational performance' },
      { href: '/meetings', label: 'Meetings', icon: Mic, description: 'Meeting intelligence and follow-ups' },
    ],
  },
  {
    label: 'Execution',
    items: [
      { href: '/agent-command', label: 'AI Agents', icon: Bot, description: 'Agent missions, runs and approvals' },
      { href: '/ai', label: 'AI Advisor', icon: MessageSquareText, description: 'Strategy conversations grounded in your data' },
      { href: '/workflows', label: 'Workflows', icon: Workflow, description: 'Workflow autopilot and execution history' },
      { href: '/tasks', label: 'Tasks & Projects', icon: CheckSquare, description: 'Work queue and project delivery' },
      { href: '/decisions', label: 'Decisions', icon: Scale, description: 'Decision governance and outcomes' },
      { href: '/founder-os', label: 'Goals & Founder OS', icon: TrendingUp, description: 'Goals, OKRs and strategic focus' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, description: 'Business and team analytics' },
      { href: '/knowledge', label: 'Knowledge Graph', icon: Network, description: 'Entities, claims and evidence' },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/team', label: 'Team', icon: Users, description: 'Members, roles and invitations' },
      { href: '/integrations', label: 'Integrations', icon: Puzzle, description: 'Connected systems and sync health' },
      { href: '/notifications', label: 'Notifications', icon: Bell, description: 'Alerts and activity' },
    ],
  },
];

export const WORKSPACE_ITEMS: NavItem[] = [
  { href: '/security', label: 'Security', icon: ShieldCheck, description: 'Sessions, API keys, MFA and audit' },
  { href: '/billing', label: 'Billing', icon: CreditCard, description: 'Plan, usage and invoices' },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Profile and workspace preferences' },
];

export const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Platform Admin', icon: ShieldAlert, description: 'Platform administration' },
];

/** Extra titled routes that are not top-level nav entries. */
const EXTRA_ROUTES: NavItem[] = [
  { href: '/security/governance', label: 'Security & Governance', icon: ShieldCheck, description: 'Retention, privacy and access review' },
  { href: '/business-twin', label: 'Business Twin', icon: Gauge, description: 'Experimental simulation workspace' },
];

const ALL_ROUTES = [...NAV_GROUPS.flatMap((g) => g.items), ...WORKSPACE_ITEMS, ...ADMIN_ITEMS, ...EXTRA_ROUTES];

export function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Resolve the page title and breadcrumb trail for the current pathname. */
export function resolveRoute(pathname: string): { item?: NavItem; group?: string; crumbs: Crumb[] } {
  const match = [...ALL_ROUTES]
    .filter((route) => isActiveRoute(pathname, route.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (!match) return { crumbs: [] };

  const group =
    NAV_GROUPS.find((g) => g.items.some((i) => i.href === match.href))?.label ??
    (WORKSPACE_ITEMS.some((i) => i.href === match.href) ? 'Workspace' : undefined);

  const crumbs: Crumb[] = [];
  if (group) crumbs.push({ label: group });

  const parent = ALL_ROUTES.find((r) => r.href !== match.href && isActiveRoute(match.href, r.href));
  if (parent) crumbs.push({ label: parent.label, href: parent.href });

  crumbs.push({ label: match.label, href: match.href });

  if (pathname !== match.href) {
    // Detail route, e.g. /meetings/[id]
    crumbs.push({ label: 'Details' });
  }

  return { item: match, group, crumbs };
}
