import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { DatabaseService } from '../database/database.service';

type Interval = 'monthly' | 'annual';
type Plan = 'starter' | 'growth' | 'professional';
type Attempt = {
  id: string; organization_id: string; plan_id: Plan; billing_interval: Interval;
  product_id: string; checkout_url: string | null; provider_subscription_id: string | null;
};
type ProviderSubscription = {
  subscription_id: string; product_id: string; customer: { customer_id: string };
  status: string; metadata?: { checkoutAttemptId?: string };
  previous_billing_date?: string; next_billing_date?: string;
  cancel_at_next_billing_date?: boolean; cancelled_at?: string;
};
const checkoutPlans = ['starter', 'growth', 'professional'] as const;

@Injectable()
export class DodoBillingService {
  private readonly logger = new Logger(DodoBillingService.name);
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  private get mode() {
    return process.env.DODO_PAYMENTS_MODE === 'live' ? 'live' : 'test';
  }

  private get secret() {
    return process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
  }

  private get configured() {
    return Boolean(process.env.DODO_PAYMENTS_API_KEY && this.secret &&
      (process.env.NODE_ENV !== 'production' || this.mode === 'live'));
  }

  private product(plan: Plan, interval: Interval) {
    return process.env['DODO_' + plan.toUpperCase() + '_' + interval.toUpperCase() + '_PRODUCT_ID']?.trim();
  }

  availability(id: string) {
    if (!checkoutPlans.includes(id as Plan)) return undefined;
    return {
      monthly: this.configured && Boolean(this.product(id as Plan, 'monthly')),
      annual: this.configured && Boolean(this.product(id as Plan, 'annual')),
    };
  }

  private async request<T>(path: string, body?: object): Promise<T> {
    const url = 'https://' + this.mode + '.dodopayments.com' + path;
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + process.env.DODO_PAYMENTS_API_KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error('Provider HTTP ' + response.status);
      return await response.json() as T;
    } catch (error) {
      // Log the route and status only: never the key or the request body.
      this.logger.warn(`Dodo ${body ? 'POST' : 'GET'} ${path.split('?')[0]} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('Dodo Payments could not complete the request. Please try again.');
    }
  }

  private redirectUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new ServiceUnavailableException('Dodo Payments returned an invalid link.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.dodopayments.com') || url.username || url.password) {
      throw new ServiceUnavailableException('Dodo Payments returned an invalid link.');
    }
    return url.toString();
  }

  private billingUrl() {
    return new URL('/billing', this.config.get<string>('appUrl') ?? 'http://localhost:3000').toString();
  }

  async checkout(user: JwtPayload, plan: Plan, interval: Interval) {
    if (!checkoutPlans.includes(plan) || !['monthly', 'annual'].includes(interval)) throw new BadRequestException('Select a supported plan and billing interval.');
    const product = this.product(plan, interval);
    if (!this.configured || !product || !/^pdt_[a-z0-9]+$/i.test(product)) {
      throw new ServiceUnavailableException('Dodo Payments checkout is being configured for this plan.');
    }
    const planRecord = await this.db.query<{ price_monthly: string; price_yearly: string }>(
      'SELECT price_monthly, price_yearly FROM billing_plans WHERE id = $1 AND is_active = TRUE', [plan],
    );
    const priceColumn = interval === 'annual' ? 'price_yearly' : 'price_monthly';
    const expectedCents = Math.round(Number(planRecord.rows[0]?.[priceColumn]) * 100);
    if (!Number.isSafeInteger(expectedCents) || expectedCents <= 0) throw new BadRequestException('This plan is unavailable for checkout.');
    const attemptId = randomUUID();
    const pending = await this.db.transaction(async (client) => {
      const org = await client.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [user.organizationId]);
      if (!org.rows[0]) throw new BadRequestException('An organization is required.');
      const active = await client.query(
        "SELECT 1 FROM subscriptions WHERE organization_id = $1 AND status IN ('active', 'trialing', 'past_due') LIMIT 1",
        [user.organizationId],
      );
      if (active.rows[0]) throw new ConflictException('Manage or end your existing subscription before starting another checkout.');
      const found = await client.query<Attempt>(
        `SELECT * FROM dodo_checkout_attempts WHERE organization_id = $1 AND mode = $2
          AND lease_expires_at > NOW() AND provider_subscription_id IS NULL ORDER BY created_at DESC LIMIT 1`,
        [user.organizationId, this.mode],
      );
      const current = found.rows[0];
      if (current) {
        if (current.checkout_url && current.product_id === product && current.plan_id === plan && current.billing_interval === interval) return current.checkout_url;
        throw new ConflictException('A checkout is already in progress for this workspace.');
      }
      await client.query(
        `INSERT INTO dodo_checkout_attempts (id, organization_id, plan_id, billing_interval, product_id, mode, lease_expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '45 seconds')`,
        [attemptId, user.organizationId, plan, interval, product, this.mode],
      );
      return null;
    });
    if (pending) return { url: this.redirectUrl(pending) };

    const catalog = await this.request<{ price?: Record<string, unknown>; is_recurring?: boolean; is_archived?: boolean }>('/products/' + product);
    const price = catalog.price;
    if (catalog.is_archived || price?.type !== 'recurring_price' || price.currency !== 'USD' ||
        price.price !== expectedCents || price.payment_frequency_count !== 1 ||
        price.payment_frequency_interval !== (interval === 'annual' ? 'Year' : 'Month') ||
        Number(price.discount_bps ?? price.discount ?? 0) !== 0 || price.purchasing_power_parity === true) {
      throw new ServiceUnavailableException('The Dodo product price or billing interval does not match the Lumorius plan.');
    }
    // Dodo's REST route for checkout sessions is /checkouts (the SDK's checkoutSessions.create).
    const result = await this.request<{ checkout_url: string }>('/checkouts', {
      product_cart: [{ product_id: product, quantity: 1 }], customer: { email: user.email },
      return_url: this.billingUrl() + '?checkout=dodo', metadata: { checkoutAttemptId: attemptId },
      subscription_data: { trial_period_days: 0 },
    });
    const url = this.redirectUrl(result.checkout_url);
    await this.db.query("UPDATE dodo_checkout_attempts SET checkout_url = $2, lease_expires_at = NOW() + INTERVAL '24 hours' WHERE id = $1", [attemptId, url]);
    return { url };
  }

  async portal(customerId: string, mode: unknown) {
    if (!this.configured || mode !== this.mode || !/^cus_[a-z0-9]+$/i.test(customerId)) {
      throw new ServiceUnavailableException('Dodo Payments portal is unavailable.');
    }
    const result = await this.request<{ link: string }>(
      '/customers/' + customerId + '/customer-portal/session?return_url=' + encodeURIComponent(this.billingUrl()), {},
    );
    return { url: this.redirectUrl(result.link) };
  }

  private verify(raw: Buffer | undefined, id: string, timestamp: string, signature: string) {
    if (!this.configured || !raw || !id || id.length > 200 || !/^\d{10}$/.test(timestamp ?? '') ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signature || signature.length > 4096) {
      throw new UnauthorizedException('Invalid Dodo webhook.');
    }
    const key = Buffer.from(this.secret!.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.').update(raw).digest();
    const valid = signature.split(/\s+/).some((item) => {
      if (!item.startsWith('v1,')) return false;
      const supplied = Buffer.from(item.slice(3), 'base64');
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    });
    if (!valid) throw new UnauthorizedException('Invalid Dodo webhook signature.');
  }

  async webhook(raw: Buffer | undefined, id: string, timestamp: string, signature: string) {
    this.verify(raw, id, timestamp, signature);
    const event = JSON.parse(raw!.toString('utf8'));
    const subId = event?.data?.subscription_id;
    if (typeof subId !== 'string' || !/^sub_[a-z0-9]+$/i.test(subId) ||
        !(String(event.type).startsWith('subscription.') || event.type === 'payment.succeeded')) return { received: true };
    await this.db.transaction(async (client) => {
      const received = await client.query(
        'INSERT INTO dodo_webhook_events (id, mode) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id', [id, this.mode],
      );
      if (!received.rows[0]) return;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['dodo:' + this.mode + ':' + subId]);
      const current = await this.request<ProviderSubscription>('/subscriptions/' + subId);
      const attemptId = current.metadata?.checkoutAttemptId ?? event.data?.metadata?.checkoutAttemptId;
      const rows = await client.query<Attempt>(
        `SELECT * FROM dodo_checkout_attempts WHERE mode = $1 AND
           (provider_subscription_id = $2 OR id = $3::uuid)
           ORDER BY (provider_subscription_id IS NOT NULL) DESC LIMIT 1 FOR UPDATE`,
        [this.mode, subId, typeof attemptId === 'string' && isUUID(attemptId) ? attemptId : null],
      );
      const attempt = rows.rows[0];
      if (!attempt || (attempt.provider_subscription_id && attempt.provider_subscription_id !== subId) ||
          current.subscription_id !== subId || !current.customer?.customer_id) return;
      const products = checkoutPlans.flatMap((plan) => (['monthly', 'annual'] as const).map((interval) => ({ plan, interval, product: this.product(plan, interval) })));
      const purchase = current.product_id === attempt.product_id
        ? { plan: attempt.plan_id, interval: attempt.billing_interval }
        : attempt.provider_subscription_id ? products.find((item) => item.product && item.product === current.product_id) : undefined;
      if (!purchase) return;
      const status = ({ active: 'active', on_hold: 'past_due', past_due: 'past_due', paused: 'past_due', pending: 'incomplete',
        failed: 'unpaid', cancelled: 'canceled', expired: 'canceled' } as Record<string, string>)[current.status];
      if (!status || (status === 'incomplete' && !attempt.provider_subscription_id)) return;

      await client.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [attempt.organization_id]);
      if (status === 'active' && !attempt.provider_subscription_id) {
        const other = await client.query(
          "SELECT 1 FROM subscriptions WHERE organization_id = $1 AND status IN ('active', 'trialing', 'past_due') AND dodo_subscription_id IS DISTINCT FROM $2 LIMIT 1",
          [attempt.organization_id, subId],
        );
        if (other.rows[0]) throw new ConflictException('This workspace already has another subscription.');
      }
      await client.query('UPDATE dodo_checkout_attempts SET provider_subscription_id = $2 WHERE id = $1', [attempt.id, subId]);
      await client.query(
        `INSERT INTO subscriptions (organization_id, plan_id, status, dodo_subscription_id, dodo_customer_id,
           current_period_start, current_period_end, cancel_at, canceled_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, jsonb_build_object('dodoMode', $10::text, 'interval', $11::text))
         ON CONFLICT (dodo_subscription_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
           metadata = EXCLUDED.metadata, current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end, cancel_at = EXCLUDED.cancel_at, canceled_at = EXCLUDED.canceled_at, updated_at = NOW()`,
        [attempt.organization_id, purchase.plan, status, subId, current.customer.customer_id,
          current.previous_billing_date ?? null, current.next_billing_date ?? null,
          current.cancel_at_next_billing_date ? current.next_billing_date ?? null : null, current.cancelled_at ?? null,
          this.mode, purchase.interval],
      );
      await client.query(
        `UPDATE organizations o SET plan_id = COALESCE((
           SELECT p.tier FROM subscriptions s JOIN billing_plans p ON p.id = s.plan_id
            WHERE s.organization_id = o.id AND s.status IN ('active', 'trialing')
            ORDER BY s.created_at DESC LIMIT 1), 'free'::plan_tier), updated_at = NOW() WHERE o.id = $1`,
        [attempt.organization_id],
      );
    });
    return { received: true };
  }
}
