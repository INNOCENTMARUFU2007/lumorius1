import { ConfigService } from '@nestjs/config';
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
export declare class BillingService {
    private readonly db;
    private readonly configService;
    private readonly logger;
    private stripe;
    constructor(db: DatabaseService, configService: ConfigService);
    getPlans(): Promise<Record<string, unknown>[]>;
    getSubscription(organizationId: string): Promise<Record<string, unknown>>;
    createCheckoutSession(organizationIdOrInput: string | CheckoutSessionInput, planId?: string, interval?: BillingInterval, successUrl?: string, cancelUrl?: string): Promise<{
        url: string;
        sessionId: string;
    }>;
    createPortalSession(organizationId: string, returnUrl: string): Promise<{
        url: string;
    }>;
    createBillingPortalSession(organizationId: string, returnUrl?: string): Promise<{
        url: string;
    }>;
    handleWebhook(payload: Buffer, signature: string): Promise<{
        received: boolean;
    }>;
    getInvoices(organizationId: string): Promise<Record<string, unknown>[]>;
    private handleCheckoutComplete;
    private handleSubscriptionChange;
    private upsertSubscription;
    private handleInvoicePaid;
    private getFrontendUrl;
}
export {};
//# sourceMappingURL=billing.service.d.ts.map