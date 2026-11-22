import { BadRequestException, Injectable } from '@nestjs/common';

const products = ['BTC-USD', 'ETH-USD', 'EUR/USD', 'USD/JPY', 'SPY', 'QQQ'] as const;
type Product = typeof products[number];
const windows = {
  '1D': [1, 900, '15min'], '1W': [7, 3600, '1h'],
  '1M': [30, 21600, '4h'], '3M': [90, 86400, '1day'],
} as const;
type Window = keyof typeof windows;
type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number | null };
type Point = { time: number; close: number };
type Series = { kind: 'candles'; interval: string; points: Bar[] } | { kind: 'reference'; interval: '1day'; points: Point[] };
type History = { symbol: Product; range: Window; source: string | null; retrievedAt: string | null; state: 'available' | 'stale' | 'unavailable'; reason?: 'provider_required' | 'no_intraday_reference' | 'source_unavailable'; series: Series | null };
const day = 86_400_000;

function bar(time: number, open: number, high: number, low: number, close: number, volume: number): Bar | null {
  if (![time, open, high, low, close].every(Number.isFinite) || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) && volume >= 0 ? volume : null };
}
async function json(url: string | URL): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Market source unavailable');
  return response.json();
}
function normalize<T extends Point>(points: T[], start: number, end: number): T[] {
  return [...new Map(points.filter(p => p.time >= start && p.time <= end).map(p => [p.time, p])).values()].sort((a, b) => a.time - b.time);
}

@Injectable()
export class MarketHistoryService {
  private readonly cache = new Map<string, { next: number; data: History }>();
  private readonly pending = new Map<string, Promise<History>>();
  history(symbolInput: string, rangeInput: string): Promise<History> {
    const symbol = typeof symbolInput === 'string' ? symbolInput.toUpperCase() as Product : null;
    const range = typeof rangeInput === 'string' ? rangeInput as Window : null;
    if (!symbol || !products.includes(symbol) || !range || !Object.prototype.hasOwnProperty.call(windows, range)) throw new BadRequestException('Select a supported symbol and range.');
    const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
    const id = [symbol, range, Boolean(apiKey)].join(':');
    const previous = this.cache.get(id);
    if (previous && previous.next > Date.now()) return Promise.resolve(previous.data);
    const active = this.pending.get(id);
    if (active) return active;
    const request = this.retrieve(symbol, range, apiKey).then(data => {
      if (data.state === 'unavailable' && previous?.data.series && previous.data.retrievedAt &&
        Date.now() - Date.parse(previous.data.retrievedAt) <= day) {
        data = { ...previous.data, state: 'stale' };
      }
      this.cache.set(id, { data, next: Date.now() + (data.state === 'available' && data.series?.kind === 'reference' ? 15 * 60_000 : 90_000) });
      return data;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, request);
    return request;
  }

  private async retrieve(symbol: Product, range: Window, apiKey?: string): Promise<History> {
    const [days, seconds, providerInterval] = windows[range];
    const end = Date.now();
    const start = end - days * day;
    const result = (source: string, series: Series): History => {
      if (!series.points.length) throw new Error('No observations were returned');
      return { symbol, range, source, series, retrievedAt: new Date().toISOString(), state: 'available' };
    };
    const unavailable = (reason: History['reason']): History => ({
      symbol, range, source: null, series: null, retrievedAt: null, state: 'unavailable', reason,
    });
    const fx = symbol.includes('/');
    try {
      if (symbol.endsWith('-USD')) {
        const url = new URL('https://api.exchange.coinbase.com/products/' + symbol + '/candles');
        url.searchParams.set('granularity', String(seconds));
        const rows = await json(url);
        const points = Array.isArray(rows) ? rows.flatMap(row => {
          if (!Array.isArray(row) || row.length < 5 || !row.slice(0, 5).every(x => typeof x === 'number')) return [];
          const [time, low, high, open, close] = row as number[];
          return bar(time * 1000, open, high, low, close, typeof row[5] === 'number' ? row[5] : NaN) ?? [];
        }) : [];
        return result('Coinbase Exchange', { kind: 'candles', interval: seconds === 21600 ? '6h' : providerInterval, points: normalize(points, start - seconds * 1000, end) });
      }
      if (apiKey) {
        try {
          const url = new URL('https://api.twelvedata.com/time_series');
          url.search = new URLSearchParams({ symbol, interval: providerInterval, timezone: 'UTC', outputsize: '200', apikey: apiKey }).toString();
          const data = await json(url) as { values?: unknown };
          const points = Array.isArray(data?.values) ? data.values.flatMap(row => {
            if (!row || typeof row.datetime !== 'string' || !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(row.datetime)) return [];
            const time = Date.parse(row.datetime.replace(' ', 'T') + (row.datetime.length === 10 ? 'T00:00:00Z' : 'Z'));
            return bar(time, Number(row.open), Number(row.high), Number(row.low), Number(row.close), row.volume == null || row.volume === '' ? NaN : Number(row.volume)) ?? [];
          }) : [];
          return result('Twelve Data', { kind: 'candles', interval: providerInterval, points: normalize(points, start, end) });
        } catch {
          if (!fx || range === '1D') return unavailable('source_unavailable');
        }
      }
      if (!fx) return unavailable('provider_required');
      if (range === '1D') return unavailable('no_intraday_reference');
      const [base, quote] = symbol.split('/');
      const url = new URL('https://api.frankfurter.dev/v2/rates');
      url.search = new URLSearchParams({ base, quotes: quote, providers: 'ecb', from: new Date(start).toISOString().slice(0, 10), to: new Date(end).toISOString().slice(0, 10) }).toString();
      const rows = await json(url);
      const points = Array.isArray(rows) ? rows.flatMap(row => row && row.base === base && row.quote === quote &&
        typeof row.rate === 'number' && Number.isFinite(row.rate) && row.rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
        ? [{ time: Date.parse(row.date), close: row.rate }] : []) : [];
      return result('ECB via Frankfurter', { kind: 'reference', interval: '1day', points: normalize(points, start - day, end) });
    } catch {
      return unavailable('source_unavailable');
    }
  }
}
