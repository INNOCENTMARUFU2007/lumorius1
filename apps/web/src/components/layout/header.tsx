'use client';

import Link from 'next/link';
import { Bell, Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/use-auth';
import { CommandPalette } from '@/components/command-palette';
import type { AuthUser } from '@/lib/auth';

interface HeaderProps {
  user?: AuthUser | null;
}

export function Header({ user }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-4 px-6 shrink-0">
      {/* Command Palette search trigger */}
      <div className="flex-1 max-w-sm">
        <CommandPalette />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications bell */}
        <Link href="/notifications" className="p-2 rounded-lg hover:bg-accent transition relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" />
        </Link>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-accent transition"
          title="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* User avatar + logout */}
        {user && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-xs font-medium text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="p-1.5 rounded-lg hover:bg-accent transition ml-1"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
