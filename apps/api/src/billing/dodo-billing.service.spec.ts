import { ServiceUnavailableException } from '@nestjs/common';
import { DodoBillingService } from './dodo-billing.service';

describe('DodoBillingService checkout', () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;

  const service = () => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM organizations')) return { rows: [{ id: 'org-1' }] };
        return { rows: [] };
      }),
    };
    const db = {
      query: jest.fn(async (sql: string) => (sql.includes('FROM billing_plans') ? { rows: [{ price_monthly: '49.00', price_yearly: '490.00' }] } : { rows: [] })),
      transaction: jest.fn(async (work: (c: typeof client) => unknown) => work(client)),
    };
    const config = { get: jest.fn(() => 'http://localhost:3000') };
    return new DodoBillingService(db as never, config as never);
  };
  const user = { sub: 'user-1', organizationId: 'org-1', role: 'owner', email: 'owner@example.com' };
  const product = (price: Record<string, unknown>) => ({ ok: true, json: async () => ({ is_archived: false, price }) });

  beforeEach(() => {
    process.env.DODO_PAYMENTS_MODE = 'test';
    process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_unit';
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'whsec_dGVzdA==';
    process.env.DODO_STARTER_MONTHLY_PRODUCT_ID = 'pdt_starter';
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });
  afterEach(() => { process.env = { ...env }; });

  it('creates the session on Dodo /checkouts after checking the product price', async () => {
    fetchMock
      .mockResolvedValueOnce(product({ type: 'recurring_price', currency: 'USD', price: 4900, payment_frequency_count: 1, payment_frequency_interval: 'Month', discount: 0 }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ checkout_url: 'https://test.checkout.dodopayments.com/session/abc' }) });
    await expect(service().checkout(user, 'starter', 'monthly')).resolves.toEqual({ url: 'https://test.checkout.dodopayments.com/session/abc' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://test.dodopayments.com/products/pdt_starter');
    expect(fetchMock.mock.calls[1][0]).toBe('https://test.dodopayments.com/checkouts');
  });

  it('refuses a product whose price does not match the plan', async () => {
    fetchMock.mockResolvedValueOnce(product({ type: 'recurring_price', currency: 'USD', price: 2900, payment_frequency_count: 1, payment_frequency_interval: 'Month' }));
    await expect(service().checkout(user, 'starter', 'monthly')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
