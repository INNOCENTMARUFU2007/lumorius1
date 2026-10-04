import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DatabaseService } from '../database/database.service';

type BillingInterval = 'monthly' | 'annual';

interface CheckoutSessionInput {
  organizationId?: string;
  orgId?: string;
  planId: string;
  interval?: BillingInterval;
  successUrl?: string;
  cancelUrl?: string;
  userId?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    const key = this.configService.get<string>(
      'stripe.secretKey',
    );

    if (key) {
      this.stripe = new Stripe(key, {
        apiVersion: '2025-02-24.acacia',
      });
    }
  }

  // ── Plans ─────────────────────────────────────────────────────

  async getPlans() {
    const res = await this.db.query(
      `SELECT *
       FROM billing_plans
       WHERE is_active = TRUE
       ORDER BY monthly_price_cents ASC`,
    );

    return res.rows;
  }

  // ── Subscription ─────────────────────────────────────────────

  async getSubscription(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         s.*,
         bp.name AS plan_name,
         bp.max_users,
         bp.storage_gb,
         bp.ai_requests_per_month
       FROM subscriptions s
       JOIN billing_plans bp
         ON s.plan_id = bp.id
       WHERE s.organization_id = $1`,
      [organizationId],
    );

    return res.rows[0] ?? null;
  }

  // ── Checkout ──────────────────────────────────────────────────

  async createCheckoutSession(
    organizationIdOrInput: string | CheckoutSessionInput,
    planId?: string,
    interval: BillingInterval = 'monthly',
    successUrl?: string,
    cancelUrl?: string,
  ) {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe not configured',
      );
    }

    let organizationId: string;
    let resolvedPlanId: string;
    let resolvedInterval: BillingInterval;
    let resolvedSuccessUrl: string;
    let resolvedCancelUrl: string;

    // Explicitly narrow the union by checking for string first.
    if (typeof organizationIdOrInput === 'string') {
      organizationId = organizationIdOrInput;
      resolvedPlanId = planId ?? '';
      resolvedInterval = interval;

      resolvedSuccessUrl =
        successUrl ??
        this.getFrontendUrl('/billing/success');

      resolvedCancelUrl =
        cancelUrl ??
        this.getFrontendUrl('/billing/cancel');
    } else {
      organizationId =
        organizationIdOrInput.organizationId ??
        organizationIdOrInput.orgId ??
        '';

      resolvedPlanId =
        organizationIdOrInput.planId;

      resolvedInterval =
        organizationIdOrInput.interval ??
        'monthly';

      resolvedSuccessUrl =
        organizationIdOrInput.successUrl ??
        this.getFrontendUrl('/billing/success');

      resolvedCancelUrl =
        organizationIdOrInput.cancelUrl ??
        this.getFrontendUrl('/billing/cancel');
    }

    if (!organizationId) {
      throw new BadRequestException(
        'Organization ID is required',
      );
    }

    if (!resolvedPlanId) {
      throw new BadRequestException(
        'Plan ID is required',
      );
    }

    const plan =
      await this.db.findOne<Record<string, unknown>>(
        'billing_plans',
        { id: resolvedPlanId },
      );

    if (!plan) {
      throw new NotFoundException(
        'Plan not found',
      );
    }

    const priceId =
      resolvedInterval === 'annual'
        ? (plan.stripe_price_id_annual as string)
        : (plan.stripe_price_id_monthly as string);

    if (!priceId) {
      throw new BadRequestException(
        'Stripe price not configured for this plan',
      );
    }

    const org =
      await this.db.findOne<Record<string, unknown>>(
        'organizations',
        { id: organizationId },
      );

    if (!org) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    let customerId =
      org.stripe_customer_id as
        | string
        | undefined;

    if (!customerId) {
      const customer =
        await this.stripe.customers.create({
          metadata: {
            organizationId,
          },
        });

      customerId = customer.id;

      await this.db.query(
        `UPDATE organizations
         SET stripe_customer_id = $1
         WHERE id = $2`,
        [customerId, organizationId],
      );
    }

    const session =
      await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: resolvedSuccessUrl,
        cancel_url: resolvedCancelUrl,
        metadata: {
          organizationId,
          planId: resolvedPlanId,
          interval: resolvedInterval,
        },
      });

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  // ── Billing Portal ────────────────────────────────────────────

  async createPortalSession(
    organizationId: string,
    returnUrl: string,
  ) {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe not configured',
      );
    }

    const org =
      await this.db.findOne<Record<string, unknown>>(
        'organizations',
        { id: organizationId },
      );

    if (!org?.stripe_customer_id) {
      throw new NotFoundException(
        'No billing account found',
      );
    }

    const session =
      await this.stripe.billingPortal.sessions.create({
        customer:
          org.stripe_customer_id as string,
        return_url: returnUrl,
      });

    return {
      url: session.url,
    };
  }

  async createBillingPortalSession(
    organizationId: string,
    returnUrl?: string,
  ) {
    return this.createPortalSession(
      organizationId,
      returnUrl ??
        this.getFrontendUrl('/billing'),
    );
  }

  // ── Webhooks ──────────────────────────────────────────────────

  async handleWebhook(
    payload: Buffer,
    signature: string,
  ) {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe not configured',
      );
    }

    const webhookSecret =
      this.configService.get<string>(
        'stripe.webhookSecret',
      );

    if (!webhookSecret) {
      throw new BadRequestException(
        'Stripe webhook secret not configured',
      );
    }

    let event: Stripe.Event;

    try {
      event =
        this.stripe.webhooks.constructEvent(
          payload,
          signature,
          webhookSecret,
        );
    } catch (err) {
      this.logger.error(
        'Webhook signature verification failed',
        err,
      );

      throw new BadRequestException(
        'Invalid webhook signature',
      );
    }

    this.logger.log(
      `Webhook: ${event.type}`,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
        );
        break;

      default:
        break;
    }

    return {
      received: true,
    };
  }

  // ── Invoices ──────────────────────────────────────────────────

  async getInvoices(
    organizationId: string,
  ) {
    const res = await this.db.query(
      `SELECT *
       FROM invoices
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 24`,
      [organizationId],
    );

    return res.rows;
  }

  // ── Webhook Handlers ──────────────────────────────────────────

  private async handleCheckoutComplete(
    session: Stripe.Checkout.Session,
  ) {
    const {
      organizationId,
      planId,
      interval,
    } = session.metadata ?? {};

    if (!organizationId || !planId) {
      return;
    }

    if (session.subscription) {
      const sub =
        await this.stripe!.subscriptions.retrieve(
          session.subscription as string,
        );

      await this.upsertSubscription(
        organizationId,
        planId,
        (interval ??
          'monthly') as BillingInterval,
        sub,
      );
    }
  }

  private async handleSubscriptionChange(
    sub: Stripe.Subscription,
  ) {
    const orgRes =
      await this.db.query(
        `SELECT id
         FROM organizations
         WHERE stripe_customer_id = $1`,
        [sub.customer as string],
      );

    if (!orgRes.rows[0]) {
      return;
    }

    const organizationId =
      (
        orgRes.rows[0] as Record<
          string,
          unknown
        >
      ).id as string;

    const planId =
      (sub.metadata?.planId ??
        'starter') as string;

    const interval =
      (sub.metadata?.interval ??
        'monthly') as BillingInterval;

    await this.upsertSubscription(
      organizationId,
      planId,
      interval,
      sub,
    );

    if (
      sub.status === 'active' ||
      sub.status === 'trialing'
    ) {
      await this.db.query(
        `UPDATE organizations
         SET plan_id = $1
         WHERE id = $2`,
        [planId, organizationId],
      );
    }
  }

  private async upsertSubscription(
    organizationId: string,
    planId: string,
    interval: string,
    sub: Stripe.Subscription,
  ) {
    await this.db.query(
      `INSERT INTO subscriptions (
         id,
         organization_id,
         plan_id,
         status,
         interval,
         stripe_subscription_id,
         stripe_price_id,
         current_period_start,
         current_period_end,
         cancel_at_period_end
       )
       VALUES (
         gen_random_uuid(),
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9
       )
       ON CONFLICT (organization_id)
       DO UPDATE SET
         plan_id = $2,
         status = $3,
         interval = $4,
         stripe_subscription_id = $5,
         stripe_price_id = $6,
         current_period_start = $7,
         current_period_end = $8,
         cancel_at_period_end = $9,
         updated_at = NOW()`,
      [
        organizationId,
        planId,
        sub.status,
        interval,
        sub.id,
        sub.items.data[0]?.price.id,
        new Date(
          (sub.current_period_start ?? 0) *
            1000,
        ),
        new Date(
          (sub.current_period_end ?? 0) *
            1000,
        ),
        sub.cancel_at_period_end,
      ],
    );
  }

  private async handleInvoicePaid(
    invoice: Stripe.Invoice,
  ) {
    const orgRes =
      await this.db.query(
        `SELECT id
         FROM organizations
         WHERE stripe_customer_id = $1`,
        [invoice.customer as string],
      );

    if (!orgRes.rows[0]) {
      return;
    }

    const organizationId =
      (
        orgRes.rows[0] as Record<
          string,
          unknown
        >
      ).id as string;

    await this.db.query(
      `INSERT INTO invoices (
         id,
         organization_id,
         stripe_invoice_id,
         amount_cents,
         currency,
         status,
         invoice_url,
         pdf_url,
         paid_at
       )
       VALUES (
         gen_random_uuid(),
         $1,
         $2,
         $3,
         $4,
         'paid',
         $5,
         $6,
         NOW()
       )
       ON CONFLICT (stripe_invoice_id)
       DO UPDATE SET
         status = 'paid',
         paid_at = NOW()`,
      [
        organizationId,
        invoice.id,
        invoice.amount_paid,
        invoice.currency,
        invoice.hosted_invoice_url,
        invoice.invoice_pdf,
      ],
    );
  }

  // ── Configuration Helpers ────────────────────────────────────

  private getFrontendUrl(
    path: string,
  ): string {
    const baseUrl =
      this.configService.get<string>(
        'app.frontendUrl',
      ) ??
      this.configService.get<string>(
        'frontendUrl',
      ) ??
      'http://localhost:3000';

    return `${baseUrl.replace(
      /\/$/,
      '',
    )}${path}`;
  }
}