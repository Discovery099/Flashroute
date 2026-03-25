import Stripe from 'stripe';
import type { BillingRepository, SubscriptionRecord } from './billing.repository';

export interface Entitlements {
  tier: 'monitor' | 'trader' | 'executor' | 'institutional';
  maxStrategies: number;
  canCreateStrategies: boolean;
  canActivateExecution: boolean;
  apiAccessLevel: 'none' | 'read' | 'execute';
  includesDemandPrediction: boolean;
  includesMultiChain: boolean;
  source: 'free' | 'stripe' | 'grace_period';
}

export interface SubscriptionDTO {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  isInGracePeriod: boolean;
  graceEndsAt: string | null;
  trialEnd: string | null;
  entitlements: Entitlements;
}

const PLAN_TO_ROLE: Record<string, string> = {
  'price_trader_monthly': 'trader',
  'price_trader_annual': 'trader',
  'price_executor_monthly': 'executor',
  'price_executor_annual': 'executor',
  'price_institutional_monthly': 'institutional',
  'price_institutional_annual': 'institutional',
};

const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;  // 72 hours

const maxStrategiesByRole = {
  monitor: 2,
  trader: 10,
  executor: 25,
  institutional: Number.POSITIVE_INFINITY,
  admin: Number.POSITIVE_INFINITY,
} as const;

const entitlementsForTier = (tier: string): Entitlements => {
  const t = tier as keyof typeof maxStrategiesByRole;
  return {
    tier: t as Entitlements['tier'],
    maxStrategies: maxStrategiesByRole[t] ?? 2,
    canCreateStrategies: maxStrategiesByRole[t] > 0,
    canActivateExecution: t === 'executor' || t === 'institutional',
    apiAccessLevel: t === 'institutional' ? 'execute' : 'none',
    includesDemandPrediction: t === 'trader' || t === 'executor' || t === 'institutional',
    includesMultiChain: t === 'executor' || t === 'institutional',
    source: 'stripe',
  };
};

export class BillingService {
  private stripe: Stripe;

  public constructor(
    private readonly repository: BillingRepository,
    private readonly stripeSecretKey: string,
    private readonly stripeWebhookSecret: string,
    private readonly priceIds: Record<string, string>,
    private readonly frontendUrl: string,
    private readonly eventPublisher?: { publish(channel: string, payload: string): Promise<number> },
  ) {
    this.stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' as any });
  }

  public async createCheckoutSession(userId: string, plan: string): Promise<{ checkoutUrl: string }> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new Error('User not found');

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });
      customerId = customer.id;
      await this.repository.updateUserStripeCustomerId(userId, customerId as string);
    }

    const priceId = this.priceIds[plan];
    if (!priceId) throw new Error('INVALID_PLAN');

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.frontendUrl}/billing?success=true`,
      cancel_url: `${this.frontendUrl}/billing?cancelled=true`,
      subscription_data: { metadata: { userId, plan } },
      allow_promotion_codes: true,
      client_reference_id: userId,
    });

    return { checkoutUrl: session.url! };
  }

  public async createPortalSession(userId: string): Promise<{ portalUrl: string }> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.stripeCustomerId) throw new Error('NO_BILLING_ACCOUNT');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/billing`,
    });
    return { portalUrl: session.url };
  }

  public async getSubscription(userId: string): Promise<SubscriptionDTO | null> {
    const subscription = await this.repository.findSubscriptionByUserId(userId);
    if (!subscription) return null;
    return this.toSubscriptionDTO(subscription);
  }

  public async getEntitlements(userId: string): Promise<Entitlements> {
    const subscription = await this.repository.findSubscriptionByUserId(userId);
    if (!subscription) {
      return { ...entitlementsForTier('monitor'), source: 'free' };
    }
    if (subscription.status === 'past_due') {
      if (subscription.graceUntil && new Date(subscription.graceUntil) > new Date()) {
        return { ...entitlementsForTier(subscription.plan), source: 'grace_period' };
      }
      return { ...entitlementsForTier('monitor'), source: 'free' };
    }
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return { ...entitlementsForTier('monitor'), source: 'free' };
    }
    return entitlementsForTier(subscription.plan);
  }

  public async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.stripeWebhookSecret);
    } catch {
      throw new Error('WEBHOOK_SIGNATURE_INVALID');
    }
    await this.processWebhookEvent(event);
  }

  public async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = (session as any).subscription_data?.metadata?.['userId'] as string;
    if (!userId) return;
    const stripeSub = await this.stripe.subscriptions.retrieve(session.subscription as string);
    await this.upsertSubscriptionFromStripe(stripeSub, userId);
  }

  private async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const existing = await this.repository.findSubscriptionByStripeSubscriptionId(stripeSub.id);
    if (existing) {
      const incomingEnd = new Date((stripeSub as any).current_period_end * 1000);
      if (incomingEnd <= existing.currentPeriodEnd) {
        return;
      }
    }
    const userId = existing?.userId ?? (await this.findUserIdByStripeCustomerId(stripeSub.customer as string));
    if (!userId) return;
    await this.upsertSubscriptionFromStripe(stripeSub, userId);
  }

  private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
    const existing = await this.repository.findSubscriptionByStripeSubscriptionId(stripeSub.id);
    if (!existing) return;
    await this.repository.updateSubscription(existing.id, { status: 'cancelled' });
    await this.repository.updateUserRole(existing.userId, 'monitor');
    const deactivatedCount = await this.repository.deactivateStrategiesForUser(existing.userId);
    await this.repository.createAuditLog({
      userId: existing.userId,
      action: 'subscription.cancelled',
      resourceType: 'subscription',
      resourceId: existing.id,
      details: { strategiesDeactivated: deactivatedCount },
    });
    await this.publishBillingChanged(existing.userId);
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const subscription = await this.repository.findSubscriptionByStripeCustomerId(customerId);
    if (!subscription) return;
    const graceUntil = new Date(Date.now() + GRACE_PERIOD_MS);
    await this.repository.updateSubscription(subscription.id, {
      status: 'past_due',
      graceUntil,
    });
    await this.repository.createAuditLog({
      userId: subscription.userId,
      action: 'subscription.payment_failed',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { graceUntil: graceUntil.toISOString() },
    });
    await this.publishBillingChanged(subscription.userId);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const subscription = await this.repository.findSubscriptionByStripeCustomerId(customerId);
    if (!subscription) return;
    await this.repository.updateSubscription(subscription.id, {
      status: 'active',
      graceUntil: null,
    });
    await this.repository.createAuditLog({
      userId: subscription.userId,
      action: 'subscription.payment_recovered',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: {},
    });
    await this.publishBillingChanged(subscription.userId);
  }

  private async upsertSubscriptionFromStripe(stripeSub: Stripe.Subscription, userId: string) {
    const priceId = stripeSub.items.data[0]?.price.id ?? '';
    const plan = PLAN_TO_ROLE[priceId] ?? 'monitor';
    const periodStart = new Date((stripeSub as any).current_period_start * 1000);
    const periodEnd = new Date((stripeSub as any).current_period_end * 1000);
    const subscription = await this.repository.upsertSubscription({
      userId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      plan,
      status: stripeSub.status === 'active' ? 'active' : stripeSub.status === 'trialing' ? 'trialing' : 'past_due',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    });
    await this.repository.updateUserRole(userId, plan);
    await this.repository.createAuditLog({
      userId,
      action: 'subscription.created',
      resourceType: 'subscription',
      resourceId: subscription.id,
      details: { plan },
    });
    await this.publishBillingChanged(userId);
  }

  private async publishBillingChanged(userId: string) {
    if (this.eventPublisher) {
      await this.eventPublisher.publish(`fr:billing:changed:${userId}`, JSON.stringify({ userId }));
    }
  }

  private async findUserIdByStripeCustomerId(customerId: string): Promise<string | null> {
    const sub = await this.repository.findSubscriptionByStripeCustomerId(customerId);
    return sub?.userId ?? null;
  }

  private toSubscriptionDTO(sub: SubscriptionRecord): SubscriptionDTO {
    const entitlements = this.getEntitlementsSync(sub);
    const now = new Date();
    const isInGracePeriod = sub.status === 'past_due' && sub.graceUntil != null && new Date(sub.graceUntil) > now;
    return {
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      isInGracePeriod,
      graceEndsAt: sub.graceUntil ? sub.graceUntil.toISOString() : null,
      trialEnd: sub.trialEnd ? sub.trialEnd.toISOString() : null,
      entitlements,
    };
  }

  private getEntitlementsSync(sub: SubscriptionRecord): Entitlements {
    if (sub.status === 'past_due') {
      if (sub.graceUntil && new Date(sub.graceUntil) > new Date()) {
        return { ...entitlementsForTier(sub.plan), source: 'grace_period' };
      }
      return { ...entitlementsForTier('monitor'), source: 'free' };
    }
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return { ...entitlementsForTier('monitor'), source: 'free' };
    }
    return entitlementsForTier(sub.plan);
  }
}
