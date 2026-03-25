import { Button, Card } from '@flashroute/ui';
import { useEffect, useState } from 'react';

import { useCreateCheckout, useCreatePortal, useSubscription, type SubscriptionDTO } from '../api';

type PlanTier = 'monitor' | 'trader' | 'executor' | 'institutional';

interface PlanDetails {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: string[];
  tier: PlanTier;
}

const PLANS: PlanDetails[] = [
  {
    name: 'Monitor',
    monthlyPrice: null,
    annualPrice: null,
    features: ['2 strategies', 'Basic analytics', 'No execution'],
    tier: 'monitor',
  },
  {
    name: 'Trader',
    monthlyPrice: 49,
    annualPrice: 470,
    features: ['10 strategies', 'Demand prediction', 'No execution', 'No multi-chain'],
    tier: 'trader',
  },
  {
    name: 'Executor',
    monthlyPrice: 149,
    annualPrice: 1430,
    features: ['25 strategies', 'Full execution', 'Multi-chain', 'Priority routing'],
    tier: 'executor',
  },
  {
    name: 'Institutional',
    monthlyPrice: 499,
    annualPrice: 4790,
    features: ['Unlimited strategies', 'API access', 'Custom strategies'],
    tier: 'institutional',
  },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  past_due: 'Past Due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  trialing: 'Trial',
  unpaid: 'Unpaid',
};

const STATUS_TONE: Record<string, 'positive' | 'warning' | 'error'> = {
  active: 'positive',
  past_due: 'warning',
  canceled: 'error',
  incomplete: 'warning',
  trialing: 'positive',
  unpaid: 'error',
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCountdown(graceEndsAt: string) {
  const now = Date.now();
  const end = new Date(graceEndsAt).getTime();
  const diff = end - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function PlanCard({
  plan,
  isCurrentPlan,
  isAnnual,
  onSelect,
}: {
  plan: PlanDetails;
  isCurrentPlan: boolean;
  isAnnual: boolean;
  onSelect: () => void;
}) {
  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
  const priceLabel = price === null ? 'Free' : `$${price}${isAnnual ? '/yr' : '/mo'}`;

  return (
    <Card
      title={plan.name}
      subtitle={priceLabel}
      className={[
        'relative',
        isCurrentPlan ? 'border-cyan-400/40' : 'border-fx-border-subtle',
      ].join(' ')}
      action={
        isCurrentPlan ? (
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/15 px-3 py-1 text-xs font-medium text-cyan-100">
            Current
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        <ul className="space-y-2 text-sm text-fx-text-secondary">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-cyan-400" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          variant={isCurrentPlan ? 'secondary' : 'primary'}
          onClick={onSelect}
          disabled={isCurrentPlan}
          className="w-full"
        >
          {isCurrentPlan ? 'Current Plan' : 'Upgrade'}
        </Button>
      </div>
    </Card>
  );
}

function CurrentPlanCard({ subscription }: { subscription: SubscriptionDTO }) {
  const createPortal = useCreatePortal();
  const statusLabel = STATUS_LABELS[subscription.status] ?? subscription.status;
  const statusTone = STATUS_TONE[subscription.status] ?? 'warning';

  return (
    <Card
      title="Current Plan"
      subtitle={`${subscription.entitlements.tier.charAt(0).toUpperCase() + subscription.entitlements.tier.slice(1)} tier`}
      className="border-fx-border"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            data-testid="status-badge"
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium',
              statusTone === 'positive' && 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100',
              statusTone === 'warning' && 'border-amber-400/30 bg-amber-400/15 text-amber-100',
              statusTone === 'error' && 'border-red-400/30 bg-red-400/15 text-red-100',
            ].join(' ')}
          >
            {statusLabel}
          </span>
          {subscription.cancelAtPeriodEnd && (
            <span className="rounded-full border border-fx-border bg-fx-surface px-3 py-1 text-xs text-fx-text-secondary">
              Cancels at period end
            </span>
          )}
        </div>

        <div className="text-sm text-fx-text-secondary">
          <p>
            Period ends:{' '}
            <span className="font-medium text-fx-text-primary">
              {formatDate(subscription.currentPeriodEnd)}
            </span>
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => createPortal.mutate()}
            disabled={createPortal.isPending}
          >
            Manage Subscription
          </Button>
        </div>
      </div>
    </Card>
  );
}

function GracePeriodBanner({ graceEndsAt }: { graceEndsAt: string }) {
  const [countdown, setCountdown] = useState(formatCountdown(graceEndsAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(graceEndsAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [graceEndsAt]);

  return (
    <div
      data-testid="grace-period-banner"
      className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      <strong>Payment failed.</strong> Your account is in grace period. {countdown}. Please update your payment method to avoid service interruption.
    </div>
  );
}

export default function BillingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const subscriptionQuery = useSubscription();
  const createCheckout = useCreateCheckout();

  const handlePlanSelect = (tier: PlanTier) => {
    const priceIdMap: Record<string, string> = {
      trader: isAnnual ? 'price_trader_annual' : 'price_trader_monthly',
      executor: isAnnual ? 'price_executor_annual' : 'price_executor_monthly',
      institutional: isAnnual ? 'price_institutional_annual' : 'price_institutional_monthly',
    };

    const priceId = priceIdMap[tier];
    if (priceId) {
      createCheckout.mutate(priceId);
    }
  };

  if (subscriptionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-64 animate-pulse rounded-2xl bg-fx-surface/80" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
          ))}
        </div>
      </div>
    );
  }

  if (subscriptionQuery.isError) {
    return (
      <Card variant="error" title="Billing unavailable" subtitle="We could not load your subscription information.">
        <Button variant="secondary" onClick={() => subscriptionQuery.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  const subscription = subscriptionQuery.data;
  const currentTier = subscription?.entitlements?.tier ?? 'monitor';

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Workspace</p>
          <h1 className="text-3xl font-semibold">Billing</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">
            Manage your subscription, view your current plan, and explore available upgrades.
          </p>
        </div>
      </header>

      {subscription?.isInGracePeriod && subscription.graceEndsAt && (
        <GracePeriodBanner graceEndsAt={subscription.graceEndsAt} />
      )}

      {subscription && <CurrentPlanCard subscription={subscription} />}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Select a Plan</h2>
          <div className="inline-flex rounded-2xl border border-fx-border bg-fx-surface/90 p-1">
            <button
              type="button"
              aria-pressed={!isAnnual}
              className={[
                'rounded-xl px-3 py-2 text-sm transition',
                !isAnnual ? 'bg-cyan-400/15 text-cyan-100' : 'text-fx-text-secondary hover:text-fx-text-primary',
              ].join(' ')}
              onClick={() => setIsAnnual(false)}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={isAnnual}
              className={[
                'rounded-xl px-3 py-2 text-sm transition',
                isAnnual ? 'bg-cyan-400/15 text-cyan-100' : 'text-fx-text-secondary hover:text-fx-text-primary',
              ].join(' ')}
              onClick={() => setIsAnnual(true)}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              isCurrentPlan={currentTier === plan.tier}
              isAnnual={isAnnual}
              onSelect={() => handlePlanSelect(plan.tier)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}