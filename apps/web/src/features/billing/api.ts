import { useMutation, useQuery } from '@tanstack/react-query';
import type { SubscriptionDTO } from '../../../../api/src/modules/billing/billing.service';

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
