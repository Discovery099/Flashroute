import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppShell } from './AppShell';
import { useUiStore } from '../state/ui.store';
import { useLiveStore } from '../state/live.store';

describe('AppShell', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarCollapsed: false,
      currentModal: null,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      globalBanner: null,
      toasts: [],
    });

    useLiveStore.setState({
      connectionStatus: 'disconnected',
      lastConnectedAt: null,
      lastMessageAt: null,
      latencyMs: null,
      subscribedChannels: [],
      missedHeartbeatCount: 0,
      connectionBannerDismissed: false,
    });
  });

  it('shows operator navigation and live fallback messaging for authenticated routes', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell>
          <div>dashboard body</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /pools/i })).toHaveAttribute('href', '/pools');
    expect(screen.getByRole('link', { name: /api keys/i })).toHaveAttribute('href', '/api-keys');
    expect(screen.getByText(/live updates paused\. falling back to background refresh\./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/user menu/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/3 unread notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/dashboard body/i)).toBeInTheDocument();
  });

  it('keeps collapsed sidebar navigation usable and reduces desktop content offset', () => {
    useUiStore.setState({ sidebarCollapsed: true });

    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell>
          <div>dashboard body</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /pools/i })).toBeInTheDocument();
    expect(container.querySelector('aside')).toHaveClass('lg:w-24');
    expect(container.querySelector('[data-app-shell-content]')).toHaveClass('lg:pl-24');
  });
});
