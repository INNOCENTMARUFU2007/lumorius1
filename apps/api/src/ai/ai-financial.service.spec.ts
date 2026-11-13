import { AiFinancialService } from './ai-financial.service';
import type { CreateAiPricingInput } from './ai-financial.service';
import { DatabaseService } from '../database/database.service';

describe('AiFinancialService', () => {
  const adminId = '33333333-3333-4333-8333-333333333333';
  let db: { query: jest.Mock };
  let service: AiFinancialService;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'pricing-row' }] }) };
    service = new AiFinancialService(db as unknown as DatabaseService);
  });

  it('creates a versioned chat price using exact decimal strings', async () => {
    const input: CreateAiPricingInput = {
      provider: 'OpenAI',
      model: 'gpt-4o-mini',
      operationType: 'chat',
      effectiveFrom: '2026-11-05T00:00:00.000Z',
      inputUsdPer1mTokens: '0.150000000000',
      outputUsdPer1mTokens: '0.600000000000',
    };

    await service.createPricing(input, adminId);

    const [sql, values] = db.query.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO ai_model_pricing');
    expect(String(sql)).toContain('ON CONFLICT (provider, model, operation_type, effective_from) DO NOTHING');
    expect(values).toEqual([
      'openai', 'gpt-4o-mini', 'chat', '0.150000000000', '0.600000000000', null,
      new Date('2026-11-05T00:00:00.000Z'), adminId,
    ]);
  });

  it('rejects chat pricing without both token rates before database access', async () => {
    await expect(service.createPricing({
      provider: 'openai', model: 'gpt-4o-mini', operationType: 'chat',
      inputUsdPer1mTokens: '0.15',
    })).rejects.toThrow('Chat pricing requires input and output token rates');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects negative or malformed rates before database access', async () => {
    await expect(service.createPricing({
      provider: 'openai', model: 'gpt-4o-mini', operationType: 'chat',
      inputUsdPer1mTokens: '-0.15', outputUsdPer1mTokens: '0.60',
    })).rejects.toThrow('inputUsdPer1mTokens must be a non-negative decimal');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects timestamps without an explicit timezone', async () => {
    await expect(service.createPricing({
      provider: 'openai', model: 'gpt-4o-mini', operationType: 'chat',
      inputUsdPer1mTokens: '0.15', outputUsdPer1mTokens: '0.60',
      effectiveFrom: '2026-11-05T00:00:00',
    })).rejects.toThrow('ISO-8601 timestamp with an explicit timezone');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists pricing with parameterized filters', async () => {
    await service.listPricing({ provider: 'openai', model: 'gpt-4o-mini', operationType: 'chat' });
    expect(String(db.query.mock.calls[0][0])).toContain('FROM ai_model_pricing');
    expect(db.query.mock.calls[0][1]).toEqual(['openai', 'gpt-4o-mini', 'chat']);
  });

  it('reports a duplicate effective timestamp as a conflict', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.createPricing({
      provider: 'openai', model: 'gpt-4o-mini', operationType: 'chat',
      effectiveFrom: '2026-11-05T00:00:00.000Z',
      inputUsdPer1mTokens: '0.15', outputUsdPer1mTokens: '0.60',
    })).rejects.toThrow('A pricing version already exists');
  });
});