'use client';

import { useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { cn } from '@/lib/utils';

type EChartsCore = typeof import('./echarts-setup').default;
type EChartsInstance = ReturnType<EChartsCore['init']>;

let loader: Promise<EChartsCore> | null = null;
function loadECharts(): Promise<EChartsCore> {
  loader ??= import('./echarts-setup').then((module) => module.default);
  return loader;
}

/** Colours and fonts resolved from the app's CSS tokens (canvas cannot read CSS variables). */
export type ChartTokens = {
  color: (token: string, alpha?: number) => string;
  fontSans: string;
  fontMono: string;
  reducedMotion: boolean;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function readTokens(): ChartTokens {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  return {
    color: (token, alpha = 1) => {
      const raw = root.getPropertyValue(`--${token}`).trim();
      const [h, s, l] = raw.replace(/,/g, ' ').split(/\s+/).map((part) => parseFloat(part));
      if (![h, s, l].every(Number.isFinite)) return `rgba(128, 128, 128, ${alpha})`;
      const [r, g, b] = hslToRgb(h, s / 100, l / 100);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    fontSans: body.fontFamily || 'sans-serif',
    fontMono: body.getPropertyValue('--font-mono').trim() || 'monospace',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** Theme tokens for charts; updates when the light/dark theme changes. Null until mounted. */
export function useChartTokens(): ChartTokens | null {
  const [tokens, setTokens] = useState<ChartTokens | null>(null);
  useEffect(() => {
    const update = () => setTokens(readTokens());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return tokens;
}

/**
 * Apache ECharts canvas, loaded on first use. Pass a memoised option; it is replaced
 * (not merged) on change so removed series disappear.
 */
export function EChart({
  option,
  height = 340,
  className,
  ariaLabel,
}: {
  option: EChartsOption | null;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    loadECharts()
      .then((echarts) => {
        const node = containerRef.current;
        if (disposed || !node) return;
        const chart = echarts.init(node, undefined, { renderer: 'canvas' });
        chartRef.current = chart;
        observer = new ResizeObserver(() => chart.resize());
        observer.observe(node);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready && option && chartRef.current) chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option, ready]);

  if (failed) {
    return (
      <div style={{ height }} className={cn('flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground', className)}>
        The chart could not load. Refresh the page to try again.
      </div>
    );
  }

  return (
    <div className={cn('relative', className)} style={{ height }}>
      {!ready && <div aria-hidden="true" className="lm-skeleton absolute inset-0 rounded-lg" />}
      <div ref={containerRef} role="img" aria-label={ariaLabel} className="h-full w-full" />
    </div>
  );
}
