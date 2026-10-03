import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
export declare class BillingController {
    private readonly billingService;
    private readonly configService;
    constructor(billingService: BillingService, configService: ConfigService);
    getPlans(): Promise<Record<string, unknown>[]>;
    getSubscription(user: JwtPayload): Promise<Record<string, unknown>>;
    createCheckout(user: JwtPayload, body: {
        planId: string;
        interval: 'monthly' | 'annual';
    }): Promise<{
        url: string;
        sessionId: string;
    }>;
    createPortal(user: JwtPayload): Promise<{
        url: string;
    }>;
    getInvoices(user: JwtPayload): Promise<Record<string, unknown>[]>;
    handleWebhook(req: RawBodyRequest<Request>, signature: string): Promise<{
        received: boolean;
    }>;
}
//# sourceMappingURL=billing.controller.d.ts.map