"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stripe_1 = __importDefault(require("stripe"));
const database_service_1 = require("../database/database.service");
let BillingService = BillingService_1 = class BillingService {
    constructor(db, configService) {
        this.db = db;
        this.configService = configService;
        this.logger = new common_1.Logger(BillingService_1.name);
        this.stripe = null;
        const key = this.configService.get('stripe.secretKey');
        if (key) {
            this.stripe = new stripe_1.default(key, {
                apiVersion: '2025-02-24.acacia',
            });
        }
    }
    async getPlans() {
        const res = await this.db.query(`SELECT *
       FROM billing_plans
       WHERE is_active = TRUE
       ORDER BY monthly_price_cents ASC`);
        return res.rows;
    }
    async getSubscription(organizationId) {
        const res = await this.db.query(`SELECT
         s.*,
         bp.name AS plan_name,
         bp.max_users,
         bp.storage_gb,
         bp.ai_requests_per_month
       FROM subscriptions s
       JOIN billing_plans bp
         ON s.plan_id = bp.id
       WHERE s.organization_id = $1`, [organizationId]);
        return res.rows[0] ?? null;
    }
    async createCheckoutSession(organizationIdOrInput, planId, interval = 'monthly', successUrl, cancelUrl) {
        if (!this.stripe) {
            throw new common_1.BadRequestException('Stripe not configured');
        }
        let organizationId;
        let resolvedPlanId;
        let resolvedInterval;
        let resolvedSuccessUrl;
        let resolvedCancelUrl;
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
        }
        else {
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
            throw new common_1.BadRequestException('Organization ID is required');
        }
        if (!resolvedPlanId) {
            throw new common_1.BadRequestException('Plan ID is required');
        }
        const plan = await this.db.findOne('billing_plans', { id: resolvedPlanId });
        if (!plan) {
            throw new common_1.NotFoundException('Plan not found');
        }
        const priceId = resolvedInterval === 'annual'
            ? plan.stripe_price_id_annual
            : plan.stripe_price_id_monthly;
        if (!priceId) {
            throw new common_1.BadRequestException('Stripe price not configured for this plan');
        }
        const org = await this.db.findOne('organizations', { id: organizationId });
        if (!org) {
            throw new common_1.NotFoundException('Organization not found');
        }
        let customerId = org.stripe_customer_id;
        if (!customerId) {
            const customer = await this.stripe.customers.create({
                metadata: {
                    organizationId,
                },
            });
            customerId = customer.id;
            await this.db.query(`UPDATE organizations
         SET stripe_customer_id = $1
         WHERE id = $2`, [customerId, organizationId]);
        }
        const session = await this.stripe.checkout.sessions.create({
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
    async createPortalSession(organizationId, returnUrl) {
        if (!this.stripe) {
            throw new common_1.BadRequestException('Stripe not configured');
        }
        const org = await this.db.findOne('organizations', { id: organizationId });
        if (!org?.stripe_customer_id) {
            throw new common_1.NotFoundException('No billing account found');
        }
        const session = await this.stripe.billingPortal.sessions.create({
            customer: org.stripe_customer_id,
            return_url: returnUrl,
        });
        return {
            url: session.url,
        };
    }
    async createBillingPortalSession(organizationId, returnUrl) {
        return this.createPortalSession(organizationId, returnUrl ??
            this.getFrontendUrl('/billing'));
    }
    async handleWebhook(payload, signature) {
        if (!this.stripe) {
            throw new common_1.BadRequestException('Stripe not configured');
        }
        const webhookSecret = this.configService.get('stripe.webhookSecret');
        if (!webhookSecret) {
            throw new common_1.BadRequestException('Stripe webhook secret not configured');
        }
        let event;
        try {
            event =
                this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        }
        catch (err) {
            this.logger.error('Webhook signature verification failed', err);
            throw new common_1.BadRequestException('Invalid webhook signature');
        }
        this.logger.log(`Webhook: ${event.type}`);
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutComplete(event.data.object);
                break;
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await this.handleSubscriptionChange(event.data.object);
                break;
            case 'invoice.paid':
                await this.handleInvoicePaid(event.data.object);
                break;
            default:
                break;
        }
        return {
            received: true,
        };
    }
    async getInvoices(organizationId) {
        const res = await this.db.query(`SELECT *
       FROM invoices
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 24`, [organizationId]);
        return res.rows;
    }
    async handleCheckoutComplete(session) {
        const { organizationId, planId, interval, } = session.metadata ?? {};
        if (!organizationId || !planId) {
            return;
        }
        if (session.subscription) {
            const sub = await this.stripe.subscriptions.retrieve(session.subscription);
            await this.upsertSubscription(organizationId, planId, (interval ??
                'monthly'), sub);
        }
    }
    async handleSubscriptionChange(sub) {
        const orgRes = await this.db.query(`SELECT id
         FROM organizations
         WHERE stripe_customer_id = $1`, [sub.customer]);
        if (!orgRes.rows[0]) {
            return;
        }
        const organizationId = orgRes.rows[0].id;
        const planId = (sub.metadata?.planId ??
            'starter');
        const interval = (sub.metadata?.interval ??
            'monthly');
        await this.upsertSubscription(organizationId, planId, interval, sub);
        if (sub.status === 'active' ||
            sub.status === 'trialing') {
            await this.db.query(`UPDATE organizations
         SET plan_id = $1
         WHERE id = $2`, [planId, organizationId]);
        }
    }
    async upsertSubscription(organizationId, planId, interval, sub) {
        await this.db.query(`INSERT INTO subscriptions (
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
         updated_at = NOW()`, [
            organizationId,
            planId,
            sub.status,
            interval,
            sub.id,
            sub.items.data[0]?.price.id,
            new Date((sub.current_period_start ?? 0) *
                1000),
            new Date((sub.current_period_end ?? 0) *
                1000),
            sub.cancel_at_period_end,
        ]);
    }
    async handleInvoicePaid(invoice) {
        const orgRes = await this.db.query(`SELECT id
         FROM organizations
         WHERE stripe_customer_id = $1`, [invoice.customer]);
        if (!orgRes.rows[0]) {
            return;
        }
        const organizationId = orgRes.rows[0].id;
        await this.db.query(`INSERT INTO invoices (
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
         paid_at = NOW()`, [
            organizationId,
            invoice.id,
            invoice.amount_paid,
            invoice.currency,
            invoice.hosted_invoice_url,
            invoice.invoice_pdf,
        ]);
    }
    getFrontendUrl(path) {
        const baseUrl = this.configService.get('app.frontendUrl') ??
            this.configService.get('frontendUrl') ??
            'http://localhost:3000';
        return `${baseUrl.replace(/\/$/, '')}${path}`;
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        config_1.ConfigService])
], BillingService);
//# sourceMappingURL=billing.service.js.map