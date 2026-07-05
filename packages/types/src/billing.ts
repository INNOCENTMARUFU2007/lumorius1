export type PlanId = 'starter' | 'growth' | 'professional' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'trialing'
  | 'incomplete';

export interface BillingPlan {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  limits: PlanLimits;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
}

export interface PlanLimits {
  maxUsers: number | null;
  storageGb: number | null;
  aiRequestsPerMonth: number | null;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  interval: BillingInterval;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  subscriptionId: string;
  amountCents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoiceUrl?: string;
  pdfUrl?: string;
  paidAt?: string;
  dueDate?: string;
  createdAt: string;
}

export interface UsageSummary {
  period: string;
  users: { used: number; limit: number | null };
  storage: { usedGb: number; limitGb: number | null };
  aiRequests: { used: number; limit: number | null };
}
