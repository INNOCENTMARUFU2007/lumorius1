import { MarketHistoryService } from './market-history.service';

describe('Business Twin market history', () => {
  const configured = process.env.TWELVE_DATA_API_KEY;
  beforeEach(() => { delete process.env.TWELVE_DATA_API_KEY; });
  afterEach(() => {
    jest.restoreAllMocks();
    if (configured !== undefined) process.env.TWELVE_DATA_API_KEY = configured;
    else delete process.env.TWELVE_DATA_API_KEY;
  });

  it('uses one provider call for concurrent requests and filters invalid candles', async () => {
    const time = Math.floor(Date.now() / 1000) - 3600;
    const data = [[time, 93, 112, 95, 108, 0], [time - 3600, 95, 98, 90, 99, 2], [time - 7200, 89, 110, 108, 94]];
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(data)));
    const service = new MarketHistoryService();
    const [first, second] = await Promise.all([service.history('BTC-USD', '1W'), service.history('BTC-USD', '1W')]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('granularity=3600');
    expect(first.series?.points).toEqual([
      { time: (time - 7200) * 1000, open: 108, high: 110, low: 89, close: 94, volume: null },
      { time: time * 1000, open: 95, high: 112, low: 93, close: 108, volume: 0 },
    ]);
  });

  it('reports ECB data as a reference line and does not invent intraday prices', async () => {
    const date = new Date(Date.now() - 86_400_000).toISOString().slice(0,10);
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ date, base: 'USD', quote: 'JPY', rate: 150.2 }])));
    const service = new MarketHistoryService();
    expect(await service.history('USD/JPY', '1D')).toMatchObject({ reason: 'no_intraday_reference' });
    expect((await service.history('USD/JPY', '1M')).series).toEqual({ kind: 'reference', interval: '1day', points: [{ time: Date.parse(date), close: 150.2 }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() => service.history('https://invalid.test', '1W')).toThrow('supported symbol');
  });

  it('returns the last retrieved data as stale after a source failure', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const row = [Math.floor(now / 1000) - 7200, 91, 100, 93, 96, 1];
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([row])))
      .mockRejectedValueOnce(new Error('offline'));
    const service = new MarketHistoryService();
    const original = await service.history('ETH-USD', '1W');
    clock.mockReturnValue(now + 100_000);
    expect(await service.history('ETH-USD', '1W')).toEqual({ ...original, state: 'stale' });
  });
});
