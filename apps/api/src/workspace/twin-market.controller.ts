import { FeatureGuard, RequiresFeature } from '../billing/entitlements';
import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

import { MarketHistoryService } from './market-history.service';
import { MarketResearchService } from './market-research.service';

const instruments = [
  ['SPY', 'US equities'], ['QQQ', 'US technology'], ['EUR/USD', 'Euro / USD'], ['USD/JPY', 'USD / Yen'],
] as const;

interface Quote { symbol: string; label: string; price: number; changePercent: number | null; asOf: string; exchangeOpen: boolean | null; source: string; reference?: boolean }
type Snapshot = { state: 'configured' | 'unavailable' | 'public_feed'; updatedAt: string | null; quotes: Quote[]; unavailable: string[] };

@Injectable()
export class TwinMarketService {
  private cached?: { snapshot: Snapshot; expiresAt: number };
  private pending?: Promise<Snapshot>;

  async snapshot(): Promise<Snapshot> {
    const key = process.env.TWELVE_DATA_API_KEY?.trim();
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.snapshot;
    this.pending ??= (key ? this.fetchQuotes(key) : this.publicQuotes()).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async publicQuotes(): Promise<Snapshot> {
    const sources: { symbol: string; fetchQuote: () => Promise<Quote> }[] = [
      ...(['BTC-USD', 'ETH-USD'] as const).map((symbol) => ({
        symbol,
        fetchQuote: async (): Promise<Quote> => {
          const result = await fetch('https://api.exchange.coinbase.com/products/' + symbol + '/ticker', { signal: AbortSignal.timeout(6500), redirect: 'error' });
          if (!result.ok) throw new Error('Public market unavailable');
          const trade = await result.json();
          const price = Number(trade.price);
          const time = Date.parse(trade.time);
          if (!(price > 0) || !Number.isFinite(time) || time > Date.now() + 60_000) throw new Error('Invalid public market quote');
          return { symbol, price, label: 'Digital asset · USD', asOf: new Date(time).toISOString(), exchangeOpen: null,
            changePercent: null, source: 'Coinbase Exchange' };
        },
      })),
      {
        symbol: 'EUR/USD',
        fetchQuote: async () => {
          const result = await fetch('https://api.frankfurter.dev/v2/rate/eur/usd?providers=ecb', { signal: AbortSignal.timeout(6500), redirect: 'error' });
          if (!result.ok) throw new Error('FX reference unavailable');
          const pair = await result.json();
          if (pair.base !== 'EUR' || pair.quote !== 'USD' || !(Number(pair.rate) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(pair.date) ||
              !Number.isFinite(Date.parse(pair.date))) throw new Error('Invalid FX reference');
          return { symbol: 'EUR/USD', label: 'Euro / USD', price: Number(pair.rate), source: 'ECB via Frankfurter',
            reference: true, asOf: pair.date, changePercent: null, exchangeOpen: null };
        },
      },
    ];
    const results = await Promise.allSettled(sources.map(({ fetchQuote }) => fetchQuote()));
    const quotes = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const snapshot: Snapshot = {
      state: quotes.length ? 'public_feed' : 'unavailable',
      updatedAt: quotes.length ? new Date().toISOString() : null,
      quotes, unavailable: sources.filter(({ symbol }) => !quotes.some((quote) => quote.symbol === symbol)).map(({ symbol }) => symbol),
    };
    this.cached = { snapshot, expiresAt: Date.now() + 65_000 };
    return snapshot;
  }

  private async fetchQuotes(key: string): Promise<Snapshot> {
    const results = await Promise.allSettled(instruments.map(async ([symbol, label]): Promise<Quote> => {
      const url = new URL('https://api.twelvedata.com/quote');
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', '1min');
      url.searchParams.set('apikey', key);
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Market data request failed');
      const data = await response.json();
      if (!data || typeof data.close !== 'string' || data.status === 'error') throw new Error('Quote unavailable');
      const stamp = Number(data.last_quote_at || data.timestamp);
      const price = Number(data.close);
      if (!Number.isFinite(stamp) || stamp < 1000000000 || stamp > Date.now() / 1000 + 60 ||
          !Number.isFinite(price) || price <= 0) throw new Error('Quote data was invalid');
      const change = typeof data.percent_change === 'string' ? Number(data.percent_change) : NaN;
      return { symbol, label, price, source: 'Twelve Data', asOf: new Date(stamp * 1000).toISOString(),
        changePercent: Number.isFinite(change) ? change : null,
        exchangeOpen: typeof data.is_market_open === 'boolean' ? data.is_market_open : null };
    }));
    const quotes = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!quotes.length) return this.publicQuotes();
    const unavailable = instruments.filter(([symbol]) => !quotes.some((quote) => quote.symbol === symbol)).map(([symbol]) => symbol);
    const snapshot: Snapshot = {
      state: quotes.length ? 'configured' : 'unavailable',
      updatedAt: quotes.length ? new Date().toISOString() : null, quotes, unavailable,
    };
    this.cached = { snapshot, expiresAt: Date.now() + 65_000 };
    return snapshot;
  }
}

@Controller('workspace/business-twin')
@UseGuards(AuthGuard('jwt'), RolesGuard, FeatureGuard)
@RequiresFeature('business_twin')
@Roles('member')
export class TwinMarketController {
  constructor(private readonly markets: TwinMarketService, private readonly research: MarketResearchService,
    private readonly historyService: MarketHistoryService) {}

  @Get('history')
  history(@Query('symbol') symbol: string, @Query('range') range: string) {
    return this.historyService.history(symbol, range);
  }

  @Get('research')
  investigate(@Query('country') country: string) { return this.research.research(country); }

  @Get('markets')
  quotes() {
    return this.markets.snapshot();
  }
}
