import { useMutation, useQuery } from '@tanstack/react-query';

interface Entitlements {
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

export const useSubscription = () =>
  useQuery<SubscriptionDTO | null>({
    queryKey: ['billing', 'subscription'],
    queryFn: () =>
      fetch('/api/v1/billing/subscription', { credentials: 'include' })
        .then(r => r.json())
        .then(d => d.success ? d.data : null),
  });

export const useCreateCheckout = () =>
  useMutation({
    mutationFn: (plan: string) =>
      fetch('/api/v1/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      }).then(r => r.json()),
  });

export const useCreatePortal = () =>
  useMutation({
    mutationFn: () =>
      fetch('/api/v1/billing/portal', {
        method: 'POST',
        credentials: 'include',
      }).then(r => r.json()),
  });
