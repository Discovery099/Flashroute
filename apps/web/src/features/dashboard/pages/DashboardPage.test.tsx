import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { DashboardPage } from './DashboardPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useLiveStore } from '@/state/live.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const dashboardPayload = {
  dashboard: {
    period: '7d',
    totalProfitUsd: 125430.22,
    todayProfitUsd: 8123.55,
    totalTrades: 148,
    successRate: 0.73,
    activeStrategies: 6,
    liveOpportunitiesCount: 14,
    bestOpportunityProfitUsd: 442.11,
    averageConfidence: 0.82,
    profitTrend: [
      { date: '2026-03-16', profit: 2200 },
      { date: '2026-03-17', profit: 3100 },
      { date: '2026-03-18', profit: 2800 },
    ],
    topStrategies: [],
    gasCostTrend: [],
    recentTrades: [
      {
        id: 'trade-1',
        executedAt: '2026-03-22T12:10:00.000Z',
        route: 'WETH -> USDC -> WETH',
        netProfitUsd: 182.44,
        gasCostUsd: 12.12,
        status: 'confirmed',
        txHash: '0xabc',
      },
    ],
    chains: [
      { chainId: 1, liveOpportunitiesCount: 7 },
      { chainId: 42161, liveOpportunitiesCount: 7 },
    ],
    lastOpportunityAt: '2026-03-22T12:10:00.000Z',
  },
};

class MockWebSocket {
  public static instances: MockWebSocket[] = [];

  public readonly url: string;
  public readyState = 0;
  private readonly listeners = new Map<string, Set<(event: Event | MessageEvent) => void>>();

  public constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public addEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  public removeEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  public send = vi.fn();
  public close = vi.fn(() => {
    this.readyState = 3;
    this.emit('close', new Event('close'));
  });

  public open() {
    this.readyState = 1;
    this.emit('open', new Event('open'));
  }

  public message(payload: unknown) {
    this.emit('message', new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  public emit(type: string, event: Event | MessageEvent) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'dashboard-token' });
    useLiveStore.setState({
      connectionStatus: 'connected',
      lastConnectedAt: '2026-03-22T12:00:00.000Z',
      lastMessageAt: '2026-03-22T12:10:00.000Z',
      latencyMs: 120,
      subscribedChannels: [],
      missedHeartbeatCount: 0,
      connectionBannerDismissed: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dashboard loading skeletons before showing KPI cards, chart controls, and recent trades', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getAllByTestId('dashboard-stat-skeleton')).toHaveLength(4);
    expect(screen.getByTestId('dashboard-chart-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-trades-skeleton')).toBeInTheDocument();

    await act(async () => {
      resolveFetch?.(
        new Response(JSON.stringify({ success: true, data: dashboardPayload }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('$125,430.22')).toBeInTheDocument();
    expect(screen.getByText('$8,123.55')).toBeInTheDocument();
    expect(screen.getByText('73.0%')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: /chain/i })).toBeInTheDocument();
    expect(screen.getByText(/weth -> usdc -> weth/i)).toBeInTheDocument();
    expect(screen.getByText(/polling only/i)).toBeInTheDocument();
  }, 10000);

  it('supports manual refresh and prepends live recent trades while preserving stale data on disconnect', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: dashboardPayload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<DashboardPage />, { route: '/dashboard' });

    expect(await screen.findByText(/weth -> usdc -> weth/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /refresh dashboard/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain('/ws?token=');

    act(() => {
      socket.open();
      socket.message({
        type: 'connected',
        data: { authenticated: true, connectionId: 'dash-conn-1', resumed: false, resumableUntil: '2026-03-22T12:05:00.000Z' },
      });
      socket.message({
        type: 'trade',
        channel: 'trades:live',
        data: {
          id: 'trade-2',
          executedAt: '2026-03-22T12:11:00.000Z',
          route: 'WBTC -> USDC -> WBTC',
          netProfitUsd: 245.12,
          gasCostUsd: 16.22,
          status: 'confirmed',
          txHash: '0xdef',
        },
      });
      socket.message({
        type: 'alert',
        channel: 'system:alerts',
        data: {
          id: 'alert-1',
          severity: 'warning',
          message: 'Sequencer latency elevated',
          createdAt: '2026-03-22T12:12:00.000Z',
        },
      });
    });

    await waitFor(() => {
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', channels: ['trades:live', 'system:alerts'] }));
    });

    expect(screen.getAllByRole('row')[1]).toHaveTextContent(/wbtc -> usdc -> wbtc/i);
    expect(screen.getByText(/sequencer latency elevated/i)).toBeInTheDocument();

    act(() => {
      socket.close();
    });

    expect(screen.getByText(/live updates paused; showing last known data while reconnecting/i)).toBeInTheDocument();
    expect(screen.getByText(/wbtc -> usdc -> wbtc/i)).toBeInTheDocument();
  }, 10000);
});
