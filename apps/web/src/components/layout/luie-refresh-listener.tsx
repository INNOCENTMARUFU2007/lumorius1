'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface ChangeFeedResponse {
  changed: boolean;
  hasMore: boolean;
  cursor: { since: string; afterId: string };
}

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
  const cursor = useRef({
    since: new Date().toISOString(),
    afterId: '00000000-0000-0000-0000-000000000000',
  });

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const poll = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const response = await api.get<unknown>('/luie/changes', {
          params: cursor.current,
        });
        const payload = unwrapResponse(response.data);
        if (!isChangeFeedResponse(payload)) {
          throw new Error('The LUIE change feed returned an unexpected response.');
        }

        if (!active) return;
        cursor.current = payload.cursor;
        if (payload.changed) {
          await queryClient.invalidateQueries();
        }
      } catch (error) {
        console.error('LUIE change-feed polling failed:', error);
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [queryClient]);

  return null;
}
