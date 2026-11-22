import { BadRequestException, Injectable } from '@nestjs/common';
import snapshot from './world-bank-snapshot.json';

export const MARKETS = {
  NG:'Nigeria', ZA:'South Africa', KE:'Kenya', GH:'Ghana', EG:'Egypt', GB:'United Kingdom',
  US:'United States', DE:'Germany', IN:'India', BR:'Brazil', CA:'Canada', AE:'United Arab Emirates',
} as const;
const SERIES = [
  { id:'NY.GDP.MKTP.KD.ZG',label:'Real GDP growth',unit:'%', purpose:'Economic activity' },
  { id:'FP.CPI.TOTL.ZG',label:'Consumer price inflation',unit:'%', purpose:'Price pressure' },
  { id:'IT.NET.USER.ZS',label:'Internet usage',unit:'%', purpose:'Digital reach' },
] as const;

function observations(data: unknown) {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].flatMap((point: { date?: unknown; value?: unknown } | null) =>
    point && typeof point.date === 'string' && /^\d{4}$/.test(point.date) && typeof point.value === 'number' && Number.isFinite(point.value)
      ? [{ period: point.date, value: point.value }] : [],
  ).sort((a: {period: string}, b: {period:string})=>b.period.localeCompare(a.period)).slice(0,10) as { period:string; value:number }[];
}

type Observation = { period: string; value: number };
type SourceSeries = { history: Observation[]; retrievedAt: string | null; publishedAt: string | null; delivery: 'source' | 'snapshot' | 'cache' | 'unavailable' };
const archived = snapshot.series as Record<string, { updated: string | null; data: Partial<Record<keyof typeof MARKETS, Observation[]>> }>;
const empty: SourceSeries = { history: [], retrievedAt: null, publishedAt: null, delivery: 'unavailable' };
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

async function publishedData(endpoint: string) {
  const signal = AbortSignal.timeout(9500);
  const options = { signal, redirect: 'manual', headers: { Accept: 'application/json' } } as const;
  let response = await fetch(endpoint, options);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const target = new URL(response.headers.get('Location') ?? '', endpoint);
    if (target.origin !== 'https://api.worldbank.org' || !target.pathname.startsWith('/v2/')) throw new Error('Unexpected research provider redirect');
    response = await fetch(target, options);
  }
  if (!response.ok) throw new Error('World Bank data unavailable');
  return response.json() as Promise<unknown>;
}

@Injectable()
export class MarketResearchService {
  private cache = new Map<string,{ expires:number; result: Awaited<ReturnType<MarketResearchService['retrieve']>> }>();
  private pending = new Map<string,ReturnType<MarketResearchService['retrieve']>>();
  async research(input: string) {
    const code = typeof input === 'string' ? input.trim().toUpperCase() : '';
    if (!Object.prototype.hasOwnProperty.call(MARKETS, code ?? '')) throw new BadRequestException('Select a supported market.');
    const country = code as keyof typeof MARKETS;
    const old = this.cache.get(code);
    if (old && old.expires > Date.now()) return old.result;
    const current = this.pending.get(code);
    if (current) return current;
    const fetch = this.retrieve(country, old?.result.indicators).then(result=>{
      this.cache.set(code,{ expires:Date.now()+(result.indicators.every(x => x.delivery === 'source') ? 86_400_000 : 300_000),result });
      return result;
    }).finally(()=>this.pending.delete(code));
    this.pending.set(code,fetch);
    return fetch;
  }
  private async retrieve(country: keyof typeof MARKETS, previous?: (SourceSeries & { id: string })[]) {
    const results = await Promise.all(SERIES.map(async indicator=>{
      const source = 'https://data.worldbank.org/indicator/'+indicator.id+'?locations='+country;
      const endpoint = 'https://api.worldbank.org/v2/country/'+country+'/indicator/'+indicator.id+'?format=json&per_page=15&source=2';
      const saved = previous?.find(candidate => candidate.id === indicator.id && candidate.history.length && candidate.delivery !== 'snapshot');
      const backup = archived[indicator.id];
      const backupHistory = backup?.data[country] ?? [];
      let series: SourceSeries;
      try {
        const data = await publishedData(endpoint);
        const history = observations(data);
        const lastUpdated = Array.isArray(data) ? data[0]?.lastupdated : null;
        if (!history.length) throw new Error('No published observations');
        series = { history, retrievedAt: new Date().toISOString(), publishedAt: typeof lastUpdated === 'string' && dateOnly.test(lastUpdated) ? lastUpdated : null, delivery: 'source' };
      } catch {
        series = saved ? { ...saved, delivery: 'cache' } : backupHistory.length ? {
          history: backupHistory, retrievedAt: snapshot.retrievedAt, publishedAt: backup.updated, delivery: 'snapshot',
        } : empty;
      }
      return { ...series, ...indicator, source };
    }));
    const count = results.filter(x=>x.history.length).length;
    return { country, countryName:MARKETS[country], state: count === results.length ? 'available' : count ? 'partial' : 'unavailable', indicators:results };
  }
}
