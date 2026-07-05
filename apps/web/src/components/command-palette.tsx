'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, LayoutDashboard, Brain, Mic, CheckSquare, Network,
  TrendingUp, BarChart3, Workflow, Sparkles, CreditCard,
  Settings, ShieldCheck, Users, Bell, Puzzle, ShieldAlert,
  ExternalLink, Hash, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Command {
  id:       string;
  label:    string;
  group:    string;
  href?:    string;
  icon:     React.ElementType;
  shortcut?: string;
  action?:  () => void;
}

const NAV_COMMANDS: Command[] = [
  { id: 'dashboard',     label: 'Dashboard',        group: 'Navigate', href: '/dashboard',     icon: LayoutDashboard },
  { id: 'brain',         label: 'Company Brain',     group: 'Navigate', href: '/brain',         icon: Brain           },
  { id: 'meetings',      label: 'Meetings',          group: 'Navigate', href: '/meetings',      icon: Mic             },
  { id: 'tasks',         label: 'Tasks & Projects',  group: 'Navigate', href: '/tasks',         icon: CheckSquare     },
  { id: 'knowledge',     label: 'Knowledge Graph',   group: 'Navigate', href: '/knowledge',     icon: Network         },
  { id: 'founder-os',    label: 'Founder OS',        group: 'Navigate', href: '/founder-os',    icon: TrendingUp      },
  { id: 'analytics',     label: 'Analytics',         group: 'Navigate', href: '/analytics',     icon: BarChart3       },
  { id: 'workflows',     label: 'Workflows',         group: 'Navigate', href: '/workflows',     icon: Workflow        },
  { id: 'ai',            label: 'AI Advisor',        group: 'Navigate', href: '/ai',            icon: Sparkles        },
  { id: 'team',          label: 'Team Members',      group: 'Navigate', href: '/team',          icon: Users           },
  { id: 'notifications', label: 'Notifications',     group: 'Navigate', href: '/notifications', icon: Bell            },
  { id: 'integrations',  label: 'Integrations',      group: 'Navigate', href: '/integrations',  icon: Puzzle          },
  { id: 'security',      label: 'Security',          group: 'Navigate', href: '/security',      icon: ShieldCheck     },
  { id: 'billing',       label: 'Billing',           group: 'Navigate', href: '/billing',       icon: CreditCard      },
  { id: 'settings',      label: 'Settings',          group: 'Navigate', href: '/settings',      icon: Settings        },
  { id: 'admin',         label: 'Admin Panel',       group: 'Navigate', href: '/admin',         icon: ShieldAlert     },
];

const QUICK_ACTIONS: Command[] = [
  { id: 'upload-doc',   label: 'Upload document',    group: 'Actions', href: '/brain',         icon: Brain    },
  { id: 'new-meeting',  label: 'Start new meeting',  group: 'Actions', href: '/meetings',      icon: Mic      },
  { id: 'new-task',     label: 'Create task',        group: 'Actions', href: '/tasks',         icon: CheckSquare },
  { id: 'view-docs',    label: 'API Documentation',  group: 'Actions', href: '/api/docs',      icon: ExternalLink, shortcut: '⌘D' },
];

export function CommandPalette() {
  const router  = useRouter();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel]     = useState(0);
  const inputRef          = useRef<HTMLInputElement>(null);

  const allCommands = [...NAV_COMMANDS, ...QUICK_ACTIONS];

  const filtered = query.trim()
    ? allCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.group.toLowerCase().includes(query.toLowerCase()),
      )
    : allCommands;

  // Group filtered commands
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    (acc[cmd.group] ??= []).push(cmd);
    return acc;
  }, {});

  const flat = Object.values(grouped).flat();

  const execute = useCallback(
    (cmd: Command) => {
      setOpen(false);
      setQuery('');
      if (cmd.action) {
        cmd.action();
      } else if (cmd.href) {
        if (cmd.href.startsWith('http') || cmd.href.startsWith('/api')) {
          window.open(cmd.href, '_blank');
        } else {
          router.push(cmd.href);
        }
      }
    },
    [router],
  );

  // Keyboard shortcut — Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setSel(0);
        setQuery('');
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && flat[sel]) {
      execute(flat[sel]);
    }
  };

  let globalIdx = -1;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setQuery(''); setSel(0); }}
        className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 hover:bg-muted border border-border rounded-lg text-sm text-muted-foreground transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search or jump to…</span>
        <kbd className="hidden sm:inline text-[10px] bg-background border border-border rounded px-1 py-0.5 font-mono">⌘K</kbd>
      </button>

      {/* Palette overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
                onKeyDown={handleKeyDown}
              >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSel(0); }}
                    placeholder="Search pages, actions, docs…"
                    className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                  />
                  <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
                </div>

                {/* Results */}
                <div className="max-h-[340px] overflow-y-auto py-2">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No results for &quot;{query}&quot;</p>
                  ) : (
                    Object.entries(grouped).map(([group, cmds]) => (
                      <div key={group}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-4 py-2 flex items-center gap-1.5">
                          <Hash className="w-3 h-3" /> {group}
                        </p>
                        {cmds.map((cmd) => {
                          globalIdx++;
                          const idx = globalIdx;
                          const Icon = cmd.icon;
                          const isSelected = sel === idx;
                          return (
                            <button
                              key={cmd.id}
                              onClick={() => execute(cmd)}
                              onMouseEnter={() => setSel(idx)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                                isSelected ? 'bg-violet-500/10 text-violet-500' : 'text-foreground hover:bg-muted/50',
                              )}
                            >
                              <Icon className={cn('w-4 h-4 shrink-0', isSelected ? 'text-violet-500' : 'text-muted-foreground')} />
                              <span className="flex-1">{cmd.label}</span>
                              {cmd.shortcut && (
                                <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 font-mono">
                                  {cmd.shortcut}
                                </kbd>
                              )}
                              {isSelected && <ArrowRight className="w-3.5 h-3.5 text-violet-500" />}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
                  <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">↵</kbd> open</span>
                  <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">ESC</kbd> close</span>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
