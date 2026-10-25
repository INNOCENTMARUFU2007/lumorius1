import { Controller, Get, Post, Body, UseGuards, RawBodyRequest, Req, Headers, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
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
  getPlans() {
    return this.billingService.getPlans();
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
  @ApiOperation({ summary: 'Create a Stripe checkout session' })
  createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { planId: string; interval: 'monthly' | 'annual' },
  ) {
    this.assertCanManageBilling(user);
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
  createPortal(@CurrentUser() user: JwtPayload) {
    this.assertCanManageBilling(user);
    const appUrl = this.configService.get<string>('appUrl');
    return this.billingService.createPortalSession(user.organizationId, `${appUrl}/billing`);
  }

  @Get('invoices')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get invoice history' })
  getInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.getInvoices(user.organizationId);
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
