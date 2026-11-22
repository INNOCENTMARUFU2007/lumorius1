'use client';

import { useEffect, useState, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, LayoutDashboard, Brain, Mic, CheckSquare, Network,
  TrendingUp, BarChart3, Gauge, Workflow, MessageSquareText, CreditCard,
  Settings, ShieldCheck, Users, Bell, Puzzle, ShieldAlert,
  ExternalLink, Hash, ArrowRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  group: string;
  href?: string;
  icon: typeof Gauge;
  shortcut?: string;
  action?: () => void;
  keywords?: string[];
}

// Keep every destination aligned with an existing Lumorius route. Related
// intelligence capabilities may intentionally point to their owning workspace.
const NAV_COMMANDS: Command[] = [
  { id: 'executive-intelligence', label: 'Executive Intelligence', group: 'Intelligence', href: '/executive-intelligence', icon: Gauge, keywords: ['executive', 'KPI', 'KPIs', 'financial intelligence', 'financial performance', 'targets', 'executive reports', 'management reporting', 'business performance'] },
  { id: 'cross-meeting-intelligence', label: 'Cross-Meeting Intelligence', group: 'Intelligence', href: '/meetings', icon: Network, keywords: ['cross meeting', 'cross-meeting', 'meeting intelligence', 'transcripts', 'meeting search', 'recurring themes', 'unresolved commitments', 'meeting decisions', 'meeting timeline'] },
  { id: 'meeting-review', label: 'Meeting Review Workspace', group: 'Intelligence', href: '/meetings', icon: Mic, keywords: ['meeting review', 'transcript review', 'action items', 'meeting analysis'] },
  { id: 'decisions', label: 'Decision Intelligence', group: 'Intelligence', href: '/decisions', icon: Network, keywords: ['governance', 'approvals', 'decision register', 'decision portfolio', 'decision outcomes'] },
  { id: 'agent-command', label: 'AI Agents', group: 'Intelligence', href: '/agent-command', icon: MessageSquareText, keywords: ['agents', 'mission', 'run history', 'approval'] },
  { id: 'chief-of-staff', label: 'Chief of Staff', group: 'Intelligence', href: '/chief-of-staff', icon: TrendingUp, keywords: ['briefing', 'priority queue', 'commitments', 'approvals'] },
  { id: 'founder-os', label: 'Founder OS', group: 'Intelligence', href: '/founder-os', icon: TrendingUp, keywords: ['strategy', 'goals', 'OKRs', 'objectives', 'founder dashboard', 'key results'] },

  { id: 'analytics', label: 'Analytics', group: 'Intelligence', href: '/analytics', icon: BarChart3, keywords: ['business analytics', 'metrics', 'KPIs', 'performance analytics', 'weekly reports'] },
  { id: 'workflows', label: 'Workflows', group: 'Intelligence', href: '/workflows', icon: Workflow, keywords: ['automation', 'workflow autopilot', 'orchestration', 'automated workflows'] },
  { id: 'ai', label: 'AI Advisor', group: 'Intelligence', href: '/ai', icon: MessageSquareText, keywords: ['AI strategy advisor', 'AI assistant', 'strategy advisor', 'artificial intelligence'] },
  { id: 'dashboard', label: 'Dashboard', group: 'Platform', href: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'workspace overview'] },
  { id: 'brain', label: 'Company Brain', group: 'Platform', href: '/brain', icon: Brain, keywords: ['documents', 'knowledge base', 'company knowledge', 'knowledge engine', 'document intelligence', 'files'] },
  { id: 'meetings', label: 'Meeting Intelligence', group: 'Platform', href: '/meetings', icon: Mic, keywords: ['meetings', 'transcripts', 'recordings', 'meeting notes', 'meeting workspace'] },
  { id: 'tasks', label: 'Tasks & Projects', group: 'Platform', href: '/tasks', icon: CheckSquare, keywords: ['tasks', 'projects', 'execution', 'action items', 'commitments', 'delivery'] },
  { id: 'knowledge', label: 'Knowledge Graph', group: 'Platform', href: '/knowledge', icon: Network, keywords: ['knowledge', 'entities', 'relationships', 'claims', 'evidence', 'knowledge graph'] },
  { id: 'team', label: 'Team Members', group: 'Workspace', href: '/team', icon: Users, keywords: ['people', 'members', 'organisation members', 'team'] },
  { id: 'notifications', label: 'Notifications', group: 'Workspace', href: '/notifications', icon: Bell, keywords: ['alerts', 'inbox', 'unread notifications'] },
  { id: 'integrations', label: 'Integrations', group: 'Workspace', href: '/integrations', icon: Puzzle, keywords: ['connected apps', 'connectors', 'slack', 'linear', 'dropbox'] },
  { id: 'security', label: 'Security', group: 'Workspace', href: '/security', icon: ShieldCheck, keywords: ['access', 'sessions', 'audit logs', 'security settings'] },
  { id: 'security-governance', label: 'Security & Governance', group: 'Workspace', href: '/security/governance', icon: ShieldCheck, keywords: ['retention', 'privacy', 'access review', 'export', 'deletion'] },
  { id: 'billing', label: 'Billing', group: 'Workspace', href: '/billing', icon: CreditCard, keywords: ['subscription', 'plan', 'payments', 'invoices'] },
  { id: 'settings', label: 'Settings', group: 'Workspace', href: '/settings', icon: Settings, keywords: ['preferences', 'profile', 'configuration'] },
];

const QUICK_ACTIONS: Command[] = [
  { id: 'upload-doc', label: 'Upload document', group: 'Actions', href: '/brain', icon: Brain, keywords: ['import document', 'add file'] },
  { id: 'new-meeting', label: 'Open meeting workspace', group: 'Actions', href: '/meetings', icon: Mic, keywords: ['new meeting', 'start meeting'] },
  { id: 'new-task', label: 'Open tasks and projects', group: 'Actions', href: '/tasks', icon: CheckSquare, keywords: ['create task', 'new project'] },
  { id: 'view-docs', label: 'API Documentation', group: 'Actions', href: '/api/docs', icon: ExternalLink, shortcut: 'API', keywords: ['swagger', 'developer docs'] },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const allCommands = [...NAV_COMMANDS, ...QUICK_ACTIONS];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? allCommands.filter((command) =>
        [command.label, command.group, ...(command.keywords ?? [])].some((term) =>
          term.toLowerCase().includes(normalizedQuery),
        ),
      )
    : allCommands;

  const grouped = filtered.reduce<Record<string, Command[]>>((groups, command) => {
    (groups[command.group] ??= []).push(command);
    return groups;
  }, {});
  const flat = Object.values(grouped).flat();

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const execute = useCallback((command: Command) => {
    closePalette();
    if (command.action) {
      command.action();
      return;
    }
    if (!command.href) return;
    if (command.href.startsWith('http') || command.href.startsWith('/api')) {
      window.open(command.href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(command.href);
  }, [closePalette, router]);

  // Global shortcut works from every dashboard route, including Executive Intelligence.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery('');
        setSelectedIndex(0);
      } else if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
        setSelectedIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && flat[selectedIndex]) {
      event.preventDefault();
      execute(flat[selectedIndex]);
    }
  };

  let globalIndex = -1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          previousFocusRef.current = triggerRef.current;
          setOpen(true);
          setQuery('');
          setSelectedIndex(0);
        }}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64 sm:px-3"
        aria-label="Search all Lumorius modules"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="lumorius-command-palette"
        title="Search all modules (Ctrl+K)"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Search or jump to…</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">Ctrl K</kbd>
      </button>

      {portalReady ? createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.button
                type="button"
                aria-label="Close global search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed inset-0 z-[1000] cursor-default bg-background/70 backdrop-blur-md"
                onClick={closePalette}
              />
              <div className="pointer-events-none fixed inset-0 z-[1001] flex items-start justify-center overflow-y-auto px-4 py-[10vh]">
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: -12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -12 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="pointer-events-auto flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-elevated ring-1 ring-primary/10"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="lumorius-command-title"
                  id="lumorius-command-palette"
                  onKeyDown={handleKeyDown}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <Search className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <label id="lumorius-command-title" htmlFor="lumorius-command-input" className="sr-only">Search Lumorius modules and actions</label>
                      <input
                        id="lumorius-command-input"
                        ref={inputRef}
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setSelectedIndex(0);
                        }}
                        placeholder="Search modules, KPIs, documents, meetings or actions..."
                        className="w-full bg-transparent py-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
                        autoComplete="off"
                        spellCheck={false}
                        aria-controls="lumorius-command-results"
                        aria-activedescendant={flat[selectedIndex] ? `lumorius-command-${flat[selectedIndex].id}` : undefined}
                      />
                    </div>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">ESC</kbd>
                    <button type="button" onClick={closePalette} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close search"><X className="h-4 w-4" /></button>
                  </div>

                  <div id="lumorius-command-results" className="min-h-0 flex-1 overflow-y-auto py-3" role="listbox" aria-label="Search results">
                    {filtered.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">No matching modules or actions</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try “Executive Intelligence”, “Meetings”, “KPI” or “Projects”.</p>
                      </div>
                    ) : (
                      Object.entries(grouped).map(([group, commands]) => (
                        <section key={group} aria-label={group}>
                          <p className="flex items-center gap-2 px-5 pb-2 pt-2 text-xs font-semibold  text-muted-foreground">
                            <Hash className="h-3.5 w-3.5" /> {group}
                          </p>
                          {commands.map((command) => {
                            globalIndex += 1;
                            const index = globalIndex;
                            const Icon = command.icon;
                            const selected = selectedIndex === index;
                            return (
                              <button
                                key={command.id}
                                id={`lumorius-command-${command.id}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => execute(command)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                onFocus={() => setSelectedIndex(index)}
                                className={cn(
                                  'flex min-h-12 w-full items-center gap-3 px-5 py-3 text-left text-[15px] transition-colors',
                                  selected ? 'bg-primary/[0.12] text-foreground' : 'text-foreground hover:bg-muted/70',
                                )}
                              >
                                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', selected ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-muted/60 text-muted-foreground')}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block break-words leading-5 font-medium">{command.label}</span>
                                  {command.keywords?.length ? <span className="mt-0.5 block whitespace-normal break-words text-xs leading-5 text-muted-foreground">{command.keywords.slice(0, 3).join('  |  ')}</span> : null}
                                </span>
                                {command.shortcut ? <kbd className="rounded border border-border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">{command.shortcut}</kbd> : null}
                                {selected ? <ArrowRight className="h-4 w-4 shrink-0 text-primary" /> : null}
                              </button>
                            );
                          })}
                        </section>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">UP</kbd> <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">DOWN</kbd> Navigate</span>
                    <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> Open</span>
                    <span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> Close</span>
                    <span className="ml-auto">{filtered.length} results</span>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  );
}