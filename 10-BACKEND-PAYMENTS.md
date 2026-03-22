# Backend Payments: FlashRoute

---

## Overview

Stripe integration for the SaaS dashboard subscription tiers. Handles checkout sessions, webhook events, subscription lifecycle, and customer portal.

**Files:** `src/services/billing.service.ts`, `src/controllers/billing.controller.ts`, `src/routes/billing.routes.ts`
**Estimated LOC:** 1,500-2,000

---

## Stripe Product Configuration

### Products & Prices (create in Stripe Dashboard or via seed script)

| Plan | Monthly Price ID | Annual Price ID | Features |
|---|---|---|---|
| Monitor (free) | — | — | No Stripe product — default tier |
| Trader | price_trader_monthly ($99) | price_trader_annual ($990) | Real-time alerts, demand prediction, backtesting |
| Executor | price_executor_monthly ($299) | price_executor_annual ($2,990) | Full execution, multi-chain, priority routing |
| Institutional | price_institutional_monthly ($999) | price_institutional_annual (custom) | Custom strategies, API, dedicated infrastructure |

### Plan → Role Mapping
```typescript
const PLAN_TO_ROLE: Record<string, string> = {
  'price_trader_monthly': 'trader',
  'price_trader_annual': 'trader',
  'price_executor_monthly': 'executor',
  'price_executor_annual': 'executor',
  'price_institutional_monthly': 'institutional',
  'price_institutional_annual': 'institutional',
}
```

---

## BillingService (src/services/billing.service.ts)

### Method: createCheckoutSession(userId: string, plan: string): Promise<{ checkoutUrl: string }>

**Steps:**
1. Get user from database
2. If user has no stripe_customer_id: create Stripe customer (`stripe.customers.create({ email, name, metadata: { userId } })`) → save customer ID to user
3. Look up price ID for requested plan
4. Create checkout session:
   ```typescript
   stripe.checkout.sessions.create({
     customer: stripeCustomerId,
     mode: 'subscription',
     line_items: [{ price: priceId, quantity: 1 }],
     success_url: `${config.frontendUrl}/billing?success=true`,
     cancel_url: `${config.frontendUrl}/billing?cancelled=true`,
     subscription_data: { metadata: { userId, plan } },
     allow_promotion_codes: true,
   })
   ```
5. Return { checkoutUrl: session.url }

### Method: createPortalSession(userId: string): Promise<{ portalUrl: string }>

**Steps:**
1. Get user's stripe_customer_id
2. Create portal session: `stripe.billingPortal.sessions.create({ customer: customerId, return_url: frontendUrl + '/billing' })`
3. Return { portalUrl: session.url }

### Method: getSubscription(userId: string): Promise<SubscriptionDTO | null>

Query subscriptions table for user. Include plan, status, current period dates, cancel status.

### Method: handleWebhook(signature: string, payload: Buffer): Promise<void>

**Steps:**
1. Verify Stripe signature: `stripe.webhooks.constructEvent(payload, signature, config.stripeWebhookSecret)`
2. Route by event type:

**checkout.session.completed:**
1. Extract subscription ID and userId from metadata
2. Fetch subscription details from Stripe
3. Upsert subscription in database
4. Update user role to match plan
5. Audit log: 'subscription.created'

**customer.subscription.updated:**
1. Fetch subscription from Stripe
2. Update database: plan, status, period dates, cancel_at_period_end
3. If plan changed: update user role
4. If status changed to 'past_due': send alert email
5. Audit log: 'subscription.updated'

**customer.subscription.deleted:**
1. Update subscription status to 'cancelled'
2. Downgrade user role to 'monitor'
3. Deactivate all strategies (executor-tier feature)
4. Audit log: 'subscription.cancelled'

**invoice.payment_failed:**
1. Update subscription status to 'past_due'
2. Queue email: payment failed notification
3. Publish system alert

**invoice.paid:**
1. Clear past_due status if applicable
2. Update current_period_start/end

3. For any unrecognized event type: log at debug level, ignore (forward-compatible)

---

## Routes

```
GET  /api/v1/billing/subscription  → billingController.getSubscription  [auth]
POST /api/v1/billing/checkout      → billingController.createCheckout   [auth]
POST /api/v1/billing/portal        → billingController.createPortal     [auth]
POST /api/v1/billing/webhook       → billingController.handleWebhook    [stripe signature, no auth]
```

---

## Test Cases (10 cases)

| # | Test | Expected | Validates |
|---|---|---|---|
| 1 | Create checkout session | Returns Stripe URL | Checkout creation |
| 2 | Checkout for user without Stripe customer | Customer created, then session created | Customer auto-creation |
| 3 | Webhook: checkout.session.completed | Subscription created, role updated | Activation flow |
| 4 | Webhook: subscription updated (upgrade) | Plan and role updated | Plan change |
| 5 | Webhook: subscription deleted | Role downgraded to monitor, strategies paused | Cancellation |
| 6 | Webhook: invoice.payment_failed | Status set to past_due, email queued | Payment failure |
| 7 | Webhook: invalid signature | 400 error, event not processed | Signature verification |
| 8 | Create portal session | Returns Stripe portal URL | Portal access |
| 9 | Get subscription (active user) | Returns subscription details | Subscription read |
| 10 | Get subscription (free user) | Returns null | No subscription |


---

## Billing Domain Model and Entitlement Rules

Billing is not just Stripe plumbing. It determines what a user may do in the product at any given moment, and entitlement mistakes can either block paying customers or allow costly execution features to unpaid accounts.

### Required database fields

The backend should persist a first-class `subscriptions` table with at least:

- `id`, `user_id`, `stripe_customer_id`, `stripe_subscription_id`,
- `stripe_price_id`, `plan_code`, `status`,
- `current_period_start`, `current_period_end`,
- `cancel_at_period_end`, `canceled_at`,
- `trial_start`, `trial_end`,
- `grace_until`,
- `metadata` JSONB,
- `last_webhook_event_id`, `updated_at`.

Additionally store a `billing_events` table for webhook idempotency and audit:

- `stripe_event_id` unique,
- `event_type`,
- `processed_at`,
- `processing_result`,
- `payload_hash`.

### Entitlement resolution

Do not infer access directly from `users.role` alone. Implement `BillingService.getEntitlements(userId)` that merges:

1. current active subscription record,
2. temporary grace period after payment failure,
3. admin overrides or promotional grants,
4. maintenance mode restrictions.

Return a normalized entitlement object, for example:

```ts
{
  tier: 'monitor' | 'trader' | 'executor' | 'institutional',
  canCreateStrategies: boolean,
  canActivateExecution: boolean,
  maxStrategies: number,
  apiAccessLevel: 'none' | 'read' | 'execute',
  includesDemandPrediction: boolean,
  includesMultiChain: boolean,
  source: 'free' | 'stripe' | 'admin_override' | 'grace_period'
}
```

Controllers and services should use this entitlement object so behavior is consistent even if role naming changes later.

## Checkout Session Rules

`createCheckoutSession()` must handle upgrades, downgrades, and duplicate purchase attempts safely.

### Validation

1. verify requested plan exists and is purchasable,
2. reject checkout if user already has active subscription for same tier unless UI is intentionally using Checkout for plan change,
3. if user is in `past_due`, allow checkout only through a “recover subscription” flow or redirect to portal,
4. attach `client_reference_id=userId` and metadata including `planCode`, `environment`, and request id.

If the user is upgrading from trader to executor, prefer direct subscription update through Stripe API rather than creating a parallel second subscription. Checkout is best for first purchase; the billing portal or explicit update endpoint is better for plan changes.

## Webhook Processing Guarantees

Webhook processing must be **idempotent**, **order-tolerant**, and **transactional**.

### Processing algorithm

1. verify signature using raw request body,
2. compute/store event id in `billing_events`; if already processed successfully, return 200 immediately,
3. start database transaction,
4. load current subscription row by Stripe subscription id or customer id,
5. apply event-specific mutation,
6. update entitlements / user role projection,
7. write audit log and billing event result,
8. commit transaction,
9. publish `fr:billing:changed:{userId}` to Redis for websocket refresh.

Out-of-order events can happen. Use Stripe object timestamps and current row state to avoid regressing data. Example: ignore an older `customer.subscription.updated` that would move period end backward after a newer event already advanced it.

### Event-specific notes

- `checkout.session.completed`: create or link customer, fetch full subscription, set initial status.
- `customer.subscription.created`: upsert if checkout completion was missed.
- `customer.subscription.updated`: canonical source for status and period changes.
- `customer.subscription.deleted`: mark canceled immediately; preserve history.
- `invoice.payment_failed`: set `status='past_due'`, populate `grace_until` (for example 72 hours), notify user.
- `invoice.paid`: clear `past_due`, clear grace fields, restore entitlements.

## Strategy Restrictions on Billing Changes

Billing changes have direct execution implications.

- downgrade from executor/institutional to trader or monitor: deactivate all live execution strategies, cancel queued execution attempts, keep strategies in read-only/inactive state.
- downgrade that removes multi-chain access: keep unsupported-chain strategies stored but disabled with reason code `billing_restricted_chain`.
- payment failure: optionally keep read access but block new activations until invoice is cured.
- cancellation at period end: retain current entitlements until `current_period_end`, then downgrade.

The downgrade flow must be run inside a durable job if it can touch many strategies. The webhook handler should update state and enqueue heavy follow-up work rather than timing out.

## Controller and Route Details

### `POST /api/v1/billing/checkout`

Body:

```json
{ "plan": "executor_monthly" }
```

Validation:

- authenticated user required,
- requested plan must be compatible with account type,
- response returns `{ checkoutUrl, expiresAt }`.

### `GET /api/v1/billing/subscription`

Return subscription plus resolved entitlements and any pending invoice flags so the dashboard can show accurate UI states.

### `POST /api/v1/billing/portal`

Only available if `stripe_customer_id` exists. If not, return domain error `NO_BILLING_ACCOUNT` rather than generic 500.

### `POST /api/v1/billing/webhook`

Route must bypass normal JSON body parsing so signature verification receives exact raw bytes.

## Operational Notes

- Use Stripe test clocks in automated tests to simulate renewals, past_due, and cancellation at period end.
- Log Stripe request ids and event ids for incident debugging.
- Never trust price ids from the frontend without server-side mapping.
- Secret rotation for webhook signing secret and API key should be supported by environment reload on deploy.


## Error Model and Testable Failure Cases

Billing endpoints should return domain-specific errors:

- `INVALID_PLAN` when plan code is unknown,
- `ALREADY_SUBSCRIBED` when user tries to buy same active tier,
- `NO_BILLING_ACCOUNT` when portal requested without customer,
- `WEBHOOK_SIGNATURE_INVALID` for bad signatures,
- `SUBSCRIPTION_STATE_CONFLICT` when Stripe state conflicts with local state and needs reconciliation.

`handleWebhook()` should never throw raw Stripe SDK errors directly to logs without redaction. Log event id, type, and request id, not full payload contents if they include customer PII.

## Reconciliation Job

Add a periodic billing reconciliation task running every 6 hours:

1. find subscriptions updated more than 24 hours ago but still in transitional states,
2. fetch canonical subscription from Stripe,
3. repair local row if drift detected,
4. re-run entitlement projection,
5. audit log `subscription.reconciled`.

This protects against missed webhooks and closes the loop operationally.

## Additional Test Cases

11. Duplicate webhook delivery → second event ignored via billing_events uniqueness.
12. Out-of-order subscription.updated → newer period dates preserved.
13. Downgrade from executor to trader → live strategies disabled, read-only strategies preserved.
14. Payment failed with grace period → activation routes blocked, dashboard still readable.
15. Reconciliation repairs stale local subscription status after simulated missed webhook.


## Plan Change Semantics

When changing plans mid-cycle, use Stripe proration behavior explicitly rather than defaulting silently. Executor upgrades should take effect immediately after successful Stripe update/webhook confirmation. Downgrades should default to `at_period_end` unless admin/support intentionally forces immediate downgrade. Persist `pending_plan_code` when a change is scheduled so the dashboard can explain upcoming entitlement changes.

## Institutional Billing Notes

Institutional customers may use manual invoicing or custom annual contracts. The billing layer should therefore support subscriptions that are not created via self-serve Checkout but are still represented in the same local entitlements model. For these accounts, store contract metadata, seat or strategy limits, and support contact notes in subscription metadata JSONB.


## Metrics to Expose

Billing service metrics should include checkout session creation failures, webhook processing latency, webhook signature failures, active subscriptions by tier, past_due count, grace-period count, and reconciliation repairs performed. These metrics are operationally important because subscription outages directly affect conversion and account access.


## Tax and Invoice Presentation Notes

Although tax calculation may stay inside Stripe Tax or manual Stripe configuration, the backend should surface invoice totals, currency, subtotal, tax, discount, and next invoice date through the subscription DTO. The dashboard should not need direct Stripe client access to explain what the customer is paying.

## Security Notes

Never expose raw Stripe customer ids, payment method ids, or invoice URLs to other users. Billing routes always scope by authenticated user id unless admin context explicitly requests another user.


## Customer Experience Edge Cases

If checkout succeeds on Stripe but local processing is delayed, the dashboard should show a temporary `activation_pending` state and poll billing status rather than confusing the user with a stale free-tier UI. Likewise, if a user opens the portal while already canceled at period end, the API should still return the portal URL so Stripe can manage reactivation cleanly.


Billing DTOs should include `isInGracePeriod` and `graceEndsAt` so frontend state is derived from server truth instead of recreating grace logic in the client.


Expose whether automatic tax, discounts, and promotion codes were applied so invoice review screens are complete.


Use cents/integers for displayed monetary totals where possible.


Persist renewal timestamps precisely for support review.


Keep subscription history immutable.


Grace-period logic must be server-enforced, not UI-only.


Return upcoming invoice context when available.


Include trial fields in DTOs.


Preserve coupon attribution.


Store invoice currency consistently.

Billing state changes should be timestamped and attributable.
Keep customer lifecycle transitions easy to reconstruct from database history.
Avoid hidden billing drift.
