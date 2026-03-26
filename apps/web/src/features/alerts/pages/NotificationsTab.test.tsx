import { fireEvent, screen, waitFor } from '@testing-library/react';

import NotificationsTab from './NotificationsTab';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const mockAlert = {
  id: 'alert_123',
  type: 'opportunity_found',
  chainId: 1,
  thresholdValue: 100.5,
  deliveryChannel: ['dashboard', 'email'] as const,
  deliveryConfig: {},
  cooldownSeconds: 60,
  isActive: true,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockAlerts = [mockAlert];

describe('NotificationsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'test-token' });
    useAuthStore.getState().setUser({ id: 'user_123', email: 'test@example.com', name: 'Test User', role: 'trader', emailVerified: true });
  });

  it('renders alerts table when data is loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, alerts: mockAlerts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<NotificationsTab />, { route: '/settings?tab=notifications' });

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Opportunity Found')).toBeInTheDocument();
    });
  });

  it('shows empty state when no alerts exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, alerts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<NotificationsTab />, { route: '/settings?tab=notifications' });

    await waitFor(() => {
      expect(screen.getByText('No alerts configured')).toBeInTheDocument();
    });
  });

  it('opens create modal when clicking Create Alert button', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, alerts: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<NotificationsTab />, { route: '/settings?tab=notifications' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create alert/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /create alert/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create Alert' })).toBeInTheDocument();
    });
  });

  it('toggles alert active state', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, alerts: mockAlerts }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, alert: { ...mockAlert, isActive: false } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    renderWithProviders(<NotificationsTab />, { route: '/settings?tab=notifications' });

    await waitFor(() => {
      expect(screen.getByText('Opportunity Found')).toBeInTheDocument();
    });

    const activeButton = screen.getByText('Active');
    fireEvent.click(activeButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/alerts/alert_123',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
      );
    });
  });
});
