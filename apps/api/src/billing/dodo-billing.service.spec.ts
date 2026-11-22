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

describe('DodoBillingService reconciliation and receipts', () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;
  beforeEach(() => {
    process.env.DODO_PAYMENTS_MODE = 'test';
    process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_unit';
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'whsec_dGVzdA==';
    process.env.DODO_GROWTH_MONTHLY_PRODUCT_ID = 'pdt_growth';
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });
  afterEach(() => { process.env = { ...env }; });
  const json = (body: unknown) => ({ ok: true, json: async () => body });

  it('applies a paid checkout found on Dodo by its checkout ID when the webhook was missed', async () => {
    const attempt = { id: '7d559613-f010-48c9-ae23-1aa56d825bcf', organization_id: 'org-1', plan_id: 'growth', billing_interval: 'monthly',
      product_id: 'pdt_growth', checkout_url: 'https://test.checkout.dodopayments.com/x', provider_subscription_id: null };
    const writes: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM dodo_checkout_attempts WHERE mode')) return { rows: [attempt] };
        if (/^\s*(INSERT|UPDATE)/.test(sql)) writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        return { rows: [] };
      }),
    };
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM dodo_checkout_attempts')) return { rows: [{ id: attempt.id, created_at: new Date('2026-11-22T16:09:06Z') }] };
        return { rows: [] };
      }),
      transaction: jest.fn(async (work: (c: typeof client) => unknown) => work(client)),
    };
    fetchMock
      .mockResolvedValueOnce(json({ items: [
        { subscription_id: 'sub_other', metadata: { checkoutAttemptId: '00000000-0000-4000-8000-000000000000' } },
        { subscription_id: 'sub_paid', metadata: { checkoutAttemptId: attempt.id } },
      ] }))
      .mockResolvedValueOnce(json({ subscription_id: 'sub_paid', product_id: 'pdt_growth', status: 'active', customer: { customer_id: 'cus_1' },
        metadata: { checkoutAttemptId: attempt.id }, next_billing_date: '2026-12-22T16:15:59Z' }));
    const service = new DodoBillingService(db as never, { get: jest.fn() } as never);
    await expect(service.sync('org-1')).resolves.toEqual({ applied: 1 });
    expect(fetchMock.mock.calls[0][0]).toContain('/subscriptions?page_size=100&created_at_gte=');
    expect(fetchMock.mock.calls[1][0]).toBe('https://test.dodopayments.com/subscriptions/sub_paid');
    expect(writes).toEqual(expect.arrayContaining(['UPDATE dodo_checkout_attempts SET', 'INSERT INTO subscriptions', 'UPDATE organizations o']));
  });

  it("refuses a receipt for another workspace's payment", async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ dodo_customer_id: 'cus_mine' }] })) };
    fetchMock.mockResolvedValueOnce(json({ payment_id: 'pay_x', customer: { customer_id: 'cus_someone_else' } }));
    const service = new DodoBillingService(db as never, { get: jest.fn() } as never);
    await expect(service.receipt('org-1', 'pay_x')).rejects.toThrow('Receipt not found.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(service.receipt('org-1', '../../etc')).rejects.toThrow('Receipt not found.');
  });
});
