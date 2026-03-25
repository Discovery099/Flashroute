import { fireEvent, screen, waitFor } from '@testing-library/react';

import BillingPage from './BillingPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const baseSubscription = {
  id: 'sub_123',
  plan: 'price_trader_monthly',
  status: 'active',
  currentPeriodStart: '2026-03-01T00:00:00.000Z',
  currentPeriodEnd: '2026-04-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  isInGracePeriod: false,
  graceEndsAt: null,
  trialEnd: null,
  entitlements: {
    tier: 'trader' as const,
    maxStrategies: 10,
    canCreateStrategies: true,
    canActivateExecution: false,
    apiAccessLevel: 'none' as const,
    includesDemandPrediction: true,
    includesMultiChain: false,
    source: 'stripe' as const,
  },
};

const graceSubscription = {
  ...baseSubscription,
  status: 'past_due',
  isInGracePeriod: true,
  graceEndsAt: '2026-03-25T18:00:00.000Z',
};

describe('BillingPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'billing-token' });
  });

  it('renders current plan and plan selector for authenticated user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: baseSubscription }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<BillingPage />, { route: '/billing' });

    expect(await screen.findByText(/billing/i)).toBeInTheDocument();
    expect(screen.getByText(/current plan/i)).toBeInTheDocument();
    expect(screen.getByText(/trader/i)).toBeInTheDocument();
    expect(screen.getAllByText(/monitor/i)).toHaveLength(2);
    expect(screen.getAllByText(/executor/i)).toHaveLength(1);
    expect(screen.getAllByText(/institutional/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /monthly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /annual/i })).toBeInTheDocument();
  });

  it('shows grace period banner when past_due in grace', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: graceSubscription }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<BillingPage />, { route: '/billing' });

    expect(await screen.findByTestId('grace-period-banner')).toBeInTheDocument();
    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
    expect(screen.getByText(/grace period/i)).toBeInTheDocument();
  });

  it('calls checkout on upgrade click', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: baseSubscription }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { url: 'https://checkout.stripe.com/test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    renderWithProviders(<BillingPage />, { route: '/billing' });

    await waitFor(() => expect(screen.getByText(/trader/i)).toBeInTheDocument());

    const executorButton = screen.getByRole('button', { name: /upgrade/i });
    fireEvent.click(executorButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/billing/checkout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ plan: 'price_executor_monthly' }),
        }),
      );
    });
  });

  it('calls portal on manage subscription click', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: baseSubscription }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { url: 'https://billing.stripe.com/portal' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    renderWithProviders(<BillingPage />, { route: '/billing' });

    await waitFor(() => expect(screen.getByText(/manage subscription/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /manage subscription/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/billing/portal',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('redirects to login when unauthenticated', async () => {
    resetAuthStore();
    useAuthStore.getState().finishBootstrap(false);

    renderWithProviders(<BillingPage />, { route: '/billing' });

    await waitFor(() => {
      expect(window.location.pathname).toMatch(/login/);
    });
  });
});