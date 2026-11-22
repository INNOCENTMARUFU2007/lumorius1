import { MarketResearchService } from './market-research.service';

describe('MarketResearchService', () => {
  afterEach(() => jest.restoreAllMocks());
  it('keeps zero, excludes missing observations, identifies sources and caches concurrent requests', async () => {
    const fetcher = jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response()); 
    fetcher.mockImplementation(async()=>new Response(JSON.stringify([{},[{ date:'2025',value:null },{date:'2024',value:0},{date:'2023',value:2.8}]])));
    const service = new MarketResearchService();
    const [first,second] = await Promise.all([service.research('ng'),service.research('NG')]);
    expect(first).toEqual(second);
    expect(first.state).toBe('available');
    expect(first.indicators[0].history).toEqual([{period:'2024',value:0},{period:'2023',value:2.8}]);
    expect(first.indicators[0].source).toMatch(/^https:\/\/data\.worldbank\.org\//);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('supplies dated published observations during an outage and rejects a supplied URL', async () => {
    const fetcher = jest.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No route'));
    const service = new MarketResearchService();
    await expect(service.research('https://example.invalid')).rejects.toThrow('supported market');
    expect(fetcher).not.toHaveBeenCalled();
    const research = await service.research('NG');
    expect(research.state).toBe('available');
    for (const indicator of research.indicators) {
      expect(indicator).toMatchObject({ delivery: 'snapshot', retrievedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/) });
      expect(indicator.history[0].value).toEqual(expect.any(Number));
    }
  });
  it('does not follow a redirect off the trusted provider', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockImplementation(async()=>new Response(null, { status:302, headers:{ Location:'https://example.invalid/v2/' } }));
    const research = await new MarketResearchService().research('NG');
    expect(research.indicators.every(indicator=>indicator.delivery==='snapshot')).toBe(true);
    expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('https://api.worldbank.org/'))).toBe(true);
  });
});
