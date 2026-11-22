'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

interface ChangeFeedResponse {
  categories?: string[];
  changed: boolean;
  hasMore: boolean;
  cursor: { since: string; afterId: string };
}

/** Change-feed category (from the API) → React Query key roots that show that data. */
const CATEGORY_QUERY_ROOTS: Record<string, string[]> = {
  documents: ['documents', 'knowledge', 'brain'],
  knowledge: ['knowledge'],
  analytics: ['analytics', 'founder-os', 'chief-of-staff'],
  meetings: ['meetings', 'chief-of-staff'],
  tasks: ['tasks', 'projects', 'founder-os', 'chief-of-staff', 'analytics'],
  projects: ['projects', 'tasks', 'project-team-options'],
  workflows: ['workflows', 'workflow-runs'],
  decisions: ['decisions', 'chief-of-staff'],
  'executive-intelligence': ['executive-intelligence', 'analytics', 'founder-os'],
  integrations: ['integrations'],
  company: ['notifications', 'chief-of-staff'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapResponse(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, 'data')) {
      return current;
    }
    current = current.data;
  }
  return current;
}

function isChangeFeedResponse(value: unknown): value is ChangeFeedResponse {
  return isRecord(value)
    && typeof value.changed === 'boolean'
    && typeof value.hasMore === 'boolean'
    && isRecord(value.cursor)
    && typeof value.cursor.since === 'string'
    && typeof value.cursor.afterId === 'string';
}

export function LuieRefreshListener() {
  const queryClient = useQueryClient();
  const {user}=useAuth();
  const scope=user?.organizationId+'/'+user?.id;
  const cursor = useRef({
    since: new Date().toISOString(),
    afterId: '00000000-0000-0000-0000-000000000000',
  });

  useEffect(() => {
    if (!user?.organizationId || !user?.id) return;
    cursor.current={since:new Date().toISOString(),afterId:'00000000-0000-0000-0000-000000000000'};
    let active = true;
    let inFlight = false;
    let lastLogged = 0;

    const poll = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const response = await api.get<unknown>('/luie/changes', {
          params: cursor.current,
        });
        const payload = unwrapResponse(response.data);
        // An unexpected body (e.g. the API restarting) is skipped quietly; the next poll retries.
        if (!isChangeFeedResponse(payload) || !active) return;
        cursor.current = payload.cursor;
        if (payload.changed) {
          // Refresh only what changed. Reloading every query on each change made dashboards slow.
          const categories = new Set((payload.categories ?? []).filter((c): c is string => typeof c === 'string'));
          const roots = new Set<string>();
          for (const category of categories) for (const root of CATEGORY_QUERY_ROOTS[category] ?? [category]) roots.add(root);
          await queryClient.invalidateQueries(
            roots.size ? { predicate: (query) => roots.has(String(query.queryKey[0])) } : undefined,
          );
        }
      } catch (error) {
        // Network blips and restarts are expected; log once per minute instead of on every poll.
        const now = Date.now();
        if (now - lastLogged > 60_000) {
          lastLogged = now;
          console.warn('Live updates paused briefly; retrying.', error instanceof Error ? error.message : error);
        }
      } finally {
        inFlight = false;
      }
    };

    // Background tabs don't poll; returning to the tab catches up immediately.
    const tick = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    tick();
    const timer = window.setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [queryClient, scope, user?.organizationId, user?.id]);

  return null;
}
