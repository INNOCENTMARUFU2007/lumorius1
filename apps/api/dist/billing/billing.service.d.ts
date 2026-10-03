import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
export declare class BillingService {
    private readonly db;
    private readonly configService;
    private readonly logger;
    private stripe;
    constructor(db: DatabaseService, configService: ConfigService);
    getPlans(): Promise<Record<string, unknown>[]>;
    getSubscription(organizationId: string): Promise<Record<string, unknown>>;
    createCheckoutSession(organizationId: string, planId: string, interval: 'monthly' | 'annual', successUrl: string, cancelUrl: string): Promise<{
        url: string;
        sessionId: string;
    }>;
    createPortalSession(organizationId: string, returnUrl: string): Promise<{
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
}
//# sourceMappingURL=billing.service.d.ts.map