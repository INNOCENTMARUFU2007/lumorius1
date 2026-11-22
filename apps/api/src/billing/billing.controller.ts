import { Controller, Get, Post, Body, UseGuards, RawBodyRequest, Req, Headers, ForbiddenException, BadRequestException, HttpCode, Param, StreamableFile } from '@nestjs/common';
import { RawApiResponse } from '../common/interceptors/transform.interceptor';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { DodoBillingService } from './dodo-billing.service';
import { BillingService } from './billing.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
    private readonly dodo: DodoBillingService,
  ) {}

  private assertCanManageBilling(user: JwtPayload): void {
    const role = String(user.role ?? '').toLowerCase();

    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException(
        'Only organisation owners and administrators can manage billing.',
      );
    }
  }
  @Get('plans')
  @ApiOperation({ summary: 'Get all available billing plans' })
  async getPlans() {
    // The 'free' row only stores the 14-day trial allowance; it is not a purchasable plan.
    const plans = (await this.billingService.getPlans()).filter((plan) => plan.id !== 'free');
    return plans.map((plan) => {
      if (plan.id === 'enterprise') return {
        ...plan, coming_soon: true, price_monthly: null, price_yearly: null, limits: {}, features: {},
        stripe_price_monthly: null, stripe_price_yearly: null,
      };
      const availability = this.dodo.availability(String(plan.id));
      return availability ? {
        ...plan, checkout_provider: 'dodo', checkout_available: availability,
        stripe_price_monthly: null, stripe_price_yearly: null,
      } : plan;
    });
  }

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current subscription' })
  getSubscription(@CurrentUser() user: JwtPayload) {
    return this.billingService.getSubscription(user.organizationId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create a billing checkout session' })
  createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { planId: string; interval: 'monthly' | 'annual' },
  ) {
    this.assertCanManageBilling(user);
    if (body?.planId === 'starter' || body?.planId === 'growth' || body?.planId === 'professional') {
      return this.dodo.checkout(user, body.planId, body.interval ?? 'monthly');
    }
    if (!body?.planId || body.planId === 'enterprise' || body.planId === 'free') {
      throw new BadRequestException('This plan is unavailable for checkout.');
    }
    const appUrl = this.configService.get<string>('appUrl');
    return this.billingService.createCheckoutSession(
      user.organizationId,
      body.planId,
      body.interval,
      `${appUrl}/billing/success`,
      `${appUrl}/billing`,
    );
  }

  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create a Stripe billing portal session' })
  async createPortal(@CurrentUser() user: JwtPayload) {
    this.assertCanManageBilling(user);
    const subscription = await this.billingService.getSubscription(user.organizationId);
    if (subscription?.dodo_customer_id) {
      const metadata = subscription.metadata as { dodoMode?: string } | null;
      return this.dodo.portal(String(subscription.dodo_customer_id), metadata?.dodoMode);
    }
    const appUrl = this.configService.get<string>('appUrl');
    return this.billingService.createPortalSession(user.organizationId, `${appUrl}/billing`);
  }

  @Post('sync')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Apply paid Dodo checkouts and refresh the subscription from Dodo' })
  async syncSubscription(@CurrentUser() user: JwtPayload) {
    this.assertCanManageBilling(user);
    const result = await this.dodo.sync(user.organizationId);
    return { ...result, subscription: await this.billingService.getSubscription(user.organizationId) };
  }

  @Get('invoices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Billing history: Dodo payments with receipts, plus any earlier invoices' })
  async getInvoices(@CurrentUser() user: JwtPayload) {
    this.assertCanManageBilling(user);
    const payments = await this.dodo.payments(user.organizationId);
    const legacy = await this.billingService.getInvoices(user.organizationId);
    return [
      ...payments.map((item) => ({ ...item, provider: 'dodo' })),
      ...(Array.isArray(legacy) ? legacy : []).map((invoice: Record<string, unknown>) => ({
        id: String(invoice.id),
        date: invoice.paid_at ?? invoice.created_at,
        amount: Number(invoice.amount_paid ?? invoice.amount_due ?? 0),
        currency: String(invoice.currency ?? 'USD').toUpperCase(),
        status: String(invoice.status ?? 'unknown'),
        description: 'Subscription invoice',
        card: null,
        receiptAvailable: false,
        receiptUrl: typeof invoice.invoice_pdf === 'string' ? invoice.invoice_pdf : null,
        provider: 'legacy',
      })),
    ];
  }

  @Get('invoices/:paymentId/receipt')
  @RawApiResponse()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Download the PDF receipt for a Dodo payment' })
  async downloadReceipt(@CurrentUser() user: JwtPayload, @Param('paymentId') paymentId: string): Promise<StreamableFile> {
    this.assertCanManageBilling(user);
    const pdf = await this.dodo.receipt(user.organizationId, paymentId);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="lumorius-receipt-' + paymentId + '.pdf"',
      length: pdf.length,
    });
  }

  @Post('webhook/dodo')
  @HttpCode(200)
  handleDodoWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('webhook-id') id: string,
    @Headers('webhook-timestamp') timestamp: string,
    @Headers('webhook-signature') signature: string,
  ) {
    return this.dodo.webhook(req.rawBody, id, timestamp, signature);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }
}
