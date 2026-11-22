'use client';

import { RouteGate } from '@/components/plan-access';
import { TrialBanner } from '@/components/layout/trial-banner';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ErrorBoundary } from '@/components/error-boundary';
import { LuieRefreshListener } from '@/components/layout/luie-refresh-listener';
import { getAccessToken } from '@/lib/auth';

const COLLAPSE_KEY = 'lumorius.sidebar.collapsed';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable — keep the expanded default */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!getAccessToken()) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }
    if (isLoading) return;
    if (!user) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }
    if (!user.emailVerified) {
      setAuthorized(false);
      router.replace('/verify-email');
      return;
    }
    if (!user.onboardingCompleted) {
      setAuthorized(false);
      router.replace('/onboarding');
      return;
    }

    setAuthorized(true);
  }, [mounted, isLoading, user, router]);

  if (!mounted || isLoading || !authorized) {
    return (
      <div className="lm-ambient flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4" role="status">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading Lumorius…</p>
        </div>
      </div>
    );
  }


  return (
    <div className="lm-ambient flex h-[100dvh] overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <LuieRefreshListener />
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileNavOpen} onMobileClose={closeMobileNav} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <TrialBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 outline-none sm:px-6 sm:py-6 xl:px-8">
          <ErrorBoundary>
            <RouteGate pathname={pathname}>{children}</RouteGate>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
