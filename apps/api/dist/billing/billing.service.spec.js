"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const common_1 = require("@nestjs/common");
const billing_service_1 = require("./billing.service");
const database_service_1 = require("../database/database.service");
const helpers_1 = require("../test/helpers");
const mockStripe = {
    customers: {
        create: jest.fn(),
        retrieve: jest.fn(),
    },
    subscriptions: {
        create: jest.fn(),
        update: jest.fn(),
        cancel: jest.fn(),
        retrieve: jest.fn(),
    },
    checkout: {
        sessions: {
            create: jest.fn(),
        },
    },
    billingPortal: {
        sessions: {
            create: jest.fn(),
        },
    },
    webhooks: {
        constructEvent: jest.fn(),
    },
};
jest.mock('stripe', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockStripe),
}));
const mockOrg = {
    id: 'org-1',
    name: 'Acme Corp',
    stripe_customer_id: 'cus_test123',
    plan_id: 'professional',
};
const mockPlan = {
    id: 'professional',
    name: 'Professional',
    stripe_price_id: 'price_prof_monthly',
    max_users: 25,
    max_documents: 1000,
    price_monthly: 299,
};
const mockSubscription = {
    id: 'sub-1',
    organization_id: 'org-1',
    stripe_subscription_id: 'sub_test123',
    status: 'active',
    plan_id: 'professional',
    current_period_start: new Date('2026-06-01'),
    current_period_end: new Date('2026-07-01'),
};
describe('BillingService', () => {
    let service;
    let db;
    const mockConfigService = {
        get: jest.fn((key) => {
            const config = {
                STRIPE_SECRET_KEY: 'sk_test_key',
                STRIPE_WEBHOOK_SECRET: 'whsec_test',
                APP_URL: 'https://lumorius.com',
            };
            return config[key];
        }),
    };
    beforeEach(async () => {
        db = (0, helpers_1.createMockDatabaseService)();
        Object.values(mockStripe.customers).forEach(fn => fn.mockReset());
        Object.values(mockStripe.subscriptions).forEach(fn => fn.mockReset());
        Object.values(mockStripe.checkout.sessions).forEach(fn => fn.mockReset());
        const module = await testing_1.Test.createTestingModule({
            providers: [
                billing_service_1.BillingService,
                { provide: database_service_1.DatabaseService, useValue: db },
                { provide: config_1.ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        service = module.get(billing_service_1.BillingService);
    });
    describe('getPlans()', () => {
        it('returns all active billing plans', async () => {
            db.query.mockResolvedValue({
                rows: [mockPlan, { ...mockPlan, id: 'enterprise', name: 'Enterprise' }],
            });
            const plans = await service.getPlans();
            expect(plans).toHaveLength(2);
            expect(plans[0].id).toBe('professional');
        });
    });
    describe('createCheckoutSession()', () => {
        it('creates Stripe checkout session and returns URL', async () => {
            db.findOne.mockResolvedValue(mockOrg);
            db.query.mockResolvedValue({ rows: [mockPlan] });
            mockStripe.checkout.sessions.create.mockResolvedValue({
                id: 'cs_test123',
                url: 'https://checkout.stripe.com/pay/cs_test123',
            });
            const result = await service.createCheckoutSession({
                orgId: 'org-1',
                planId: 'professional',
                userId: 'user-1',
            });
            expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
            expect(result.url).toContain('stripe.com');
        });
        it('throws NotFoundException if org not found', async () => {
            db.findOne.mockResolvedValue(null);
            await expect(service.createCheckoutSession({ orgId: 'bad-org', planId: 'professional', userId: 'u1' })).rejects.toThrow(common_1.NotFoundException);
        });
        it('throws BadRequestException if plan not found', async () => {
            db.findOne.mockResolvedValue(mockOrg);
            db.query.mockResolvedValue({ rows: [] });
            await expect(service.createCheckoutSession({ orgId: 'org-1', planId: 'bad-plan', userId: 'u1' })).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('getSubscription()', () => {
        it('returns active subscription for org', async () => {
            db.findOne.mockResolvedValue(mockSubscription);
            const result = await service.getSubscription('org-1');
            expect(result).toEqual(mockSubscription);
            expect(db.findOne).toHaveBeenCalledTimes(1);
        });
        it('returns null when no subscription found', async () => {
            db.findOne.mockResolvedValue(null);
            const result = await service.getSubscription('org-no-sub');
            expect(result).toBeNull();
        });
    });
    describe('createBillingPortalSession()', () => {
        it('creates portal session for org with Stripe customer', async () => {
            db.findOne.mockResolvedValue(mockOrg);
            mockStripe.billingPortal.sessions.create.mockResolvedValue({
                url: 'https://billing.stripe.com/p/session/test123',
            });
            const result = await service.createBillingPortalSession('org-1');
            expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
                customer: mockOrg.stripe_customer_id,
                return_url: expect.stringContaining('lumorius.com'),
            });
            expect(result.url).toContain('stripe.com');
        });
        it('throws NotFoundException if org has no Stripe customer', async () => {
            db.findOne.mockResolvedValue({ ...mockOrg, stripe_customer_id: null });
            await expect(service.createBillingPortalSession('org-no-stripe')).rejects.toThrow(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=billing.service.spec.js.map