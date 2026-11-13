import { AiController } from './ai.controller';

describe('AiController grounded endpoints', () => {
  const user = {
    sub: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    role: 'member',
  };
  const sources = [{
    citationId: 'S1',
    sourceType: 'task',
    sourceId: '33333333-3333-4333-8333-333333333333',
    title: 'Renew customer contract',
    excerpt: 'Renewal is due next month.',
    relevanceScore: 0.8,
  }];
  let aiService: Record<string, jest.Mock>;
  let retrievalService: { retrieveUnified: jest.Mock };
  let controller: AiController;

  beforeEach(() => {
    aiService = {
      sendMessage: jest.fn().mockResolvedValue({ response: 'Answer', sources }),
      strategyAdvisor: jest.fn().mockResolvedValue({ analysis: 'Analysis' }),
      detectRisksAndOpportunities: jest.fn().mockResolvedValue({ risks: [], opportunities: [] }),
      generateWeeklyReport: jest.fn().mockResolvedValue({ content: 'Report' }),
    };
    retrievalService = {
      retrieveUnified: jest.fn().mockResolvedValue({ sources }),
    };
    controller = new AiController(aiService as never, retrievalService as never);
  });

  it('grounds Advisor chat in authorized unified sources and returns citations', async () => {
    const result = await controller.sendMessage(user, { message: 'What should we do?' });

    expect(retrievalService.retrieveUnified).toHaveBeenCalledWith({
      organizationId: user.organizationId,
      userId: user.sub,
      role: user.role,
      query: 'What should we do?',
      limit: 6,
    });
    expect(aiService.sendMessage).toHaveBeenCalledWith(
      user.sub,
      user.organizationId,
      'What should we do?',
      undefined,
      { sources },
    );
    expect(result).toEqual({ response: 'Answer', sources });
  });

  it('grounds strategy analysis in the same retrieved evidence', async () => {
    await controller.strategyAnalyze(user, { question: 'Assess renewal risk' });

    expect(aiService.strategyAdvisor).toHaveBeenCalledWith(
      user.organizationId,
      'Assess renewal risk',
      { sources },
      user.sub,
    );
  });

  it('includes retrieved evidence in risk analysis and weekly reports', async () => {
    const data = { revenue: 250.5 };

    await controller.detectRisksOpportunities(user, { data });
    await controller.generateWeeklyReport(user, { data });

    expect(aiService.detectRisksAndOpportunities).toHaveBeenCalledWith(
      { ...data, intelligence_sources: sources },
      { organizationId: user.organizationId, userId: user.sub, feature: 'risk_analysis' },
    );
    expect(aiService.generateWeeklyReport).toHaveBeenCalledWith(
      { ...data, intelligence_sources: sources },
      { organizationId: user.organizationId, userId: user.sub, feature: 'weekly_report' },
    );
    expect(retrievalService.retrieveUnified).toHaveBeenCalledTimes(2);
  });
});
