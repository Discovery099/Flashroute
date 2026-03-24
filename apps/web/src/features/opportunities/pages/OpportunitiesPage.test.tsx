import { act, fireEvent, screen } from '@testing-library/react';

import { OpportunitiesPage } from './OpportunitiesPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useLiveStore } from '@/state/live.store';
import { renderWithProviders } from '@/test/renderWithProviders';

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

const opportunitiesResponse = {
  opportunities: [
    {
      id: 'opp-1',
      chainId: 42161,
      routePath: [
        { pool: '0xpool-1', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' },
        { pool: '0xpool-2', tokenIn: 'USDC', tokenOut: 'WETH', dex: 'uniswap_v2' },
      ],
      hops: 2,
      estimatedProfitUsd: 44.21,
      confidenceScore: 0.84,
      flashLoanToken: 'WETH',
      flashLoanAmount: '15',
      gasEstimateGwei: 0.12,
      expiresInMs: 15_000,
      demandPrediction: { impactedPools: 2, predictedProfitChange: -1.2, badge: 'watch' },
      discoveredAt: '2026-03-22T12:00:00.000Z',
    },
  ],
};

describe('OpportunitiesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'live-token' });
    useLiveStore.setState({
      connectionStatus: 'disconnected',
      lastConnectedAt: null,
      lastMessageAt: '2026-03-22T12:00:00.000Z',
      latencyMs: null,
      subscribedChannels: [],
      missedHeartbeatCount: 0,
      connectionBannerDismissed: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows an offline banner with stale timestamp instead of the empty scanning state when disconnected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { opportunities: [] }, meta: { total: 0, limit: 20 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<OpportunitiesPage />, { route: '/opportunities' });

    expect(screen.getByText(/live feed offline/i)).toBeInTheDocument();
    expect(screen.getByText(/last update 2026-03-22 12:00:00/i)).toBeInTheDocument();
    expect(screen.queryByText(/no profitable opportunities at the moment/i)).not.toBeInTheDocument();
  });

  it('wires live updates to the /ws feed with subscribe, prepend, dedupe, highlight, expiry removal, and pause buffering', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: opportunitiesResponse, meta: { total: 1, limit: 20 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<OpportunitiesPage />, { route: '/opportunities' });

    expect(await screen.findAllByText(/weth -> usdc -> weth/i)).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: /chain/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /minimum profit/i })).toHaveValue(1);
    expect(screen.getByRole('slider', { name: /confidence threshold/i })).toHaveValue('0.5');

    vi.useFakeTimers();

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain('/ws?token=live-token');

    act(() => {
      socket.open();
      socket.message({
        type: 'connected',
        data: { authenticated: true, connectionId: 'conn-1', resumed: false, resumableUntil: '2026-03-22T12:05:00.000Z' },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', channels: ['opportunities:42161'] }));

    act(() => {
      socket.message({
        type: 'opportunity',
        channel: 'opportunities:42161',
        data: opportunitiesResponse.opportunities[0],
      });
    });

    expect(screen.getAllByTestId('opportunity-row')).toHaveLength(2);

    act(() => {
      socket.message({
        type: 'opportunity',
        channel: 'opportunities:42161',
        data: {
          id: 'opp-2',
          chainId: 42161,
          routePath: [
            { pool: '0xpool-3', tokenIn: 'WBTC', tokenOut: 'USDC', dex: 'uniswap_v3' },
            { pool: '0xpool-4', tokenIn: 'USDC', tokenOut: 'WBTC', dex: 'uniswap_v2' },
          ],
          hops: 2,
          estimatedProfitUsd: 88.9,
          confidenceScore: 0.91,
          flashLoanToken: 'WBTC',
          flashLoanAmount: '3',
          gasEstimateGwei: 0.2,
          expiresInMs: 2_000,
          demandPrediction: { impactedPools: 1, predictedProfitChange: 1.4, badge: 'surging' },
          discoveredAt: '2026-03-22T12:00:03.000Z',
        },
      });
    });

    const rows = screen.getAllByTestId('opportunity-row');
    expect(rows[0]).toHaveTextContent(/wbtc -> usdc -> wbtc/i);
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true');

    act(() => {
      vi.advanceTimersByTime(2_500);
    });

    expect(screen.getAllByTestId('opportunity-row')[0]).toHaveAttribute('data-highlighted', 'false');

    fireEvent.click(screen.getByRole('switch', { name: /pause live updates/i }));

    act(() => {
      socket.message({
        type: 'opportunity',
        channel: 'opportunities:42161',
        data: {
          id: 'opp-3',
          chainId: 42161,
          routePath: [
            { pool: '0xpool-5', tokenIn: 'ARB', tokenOut: 'USDC', dex: 'uniswap_v3' },
            { pool: '0xpool-6', tokenIn: 'USDC', tokenOut: 'ARB', dex: 'uniswap_v2' },
          ],
          hops: 2,
          estimatedProfitUsd: 22,
          confidenceScore: 0.77,
          flashLoanToken: 'ARB',
          flashLoanAmount: '400',
          gasEstimateGwei: 0.08,
          expiresInMs: 10_000,
          demandPrediction: { impactedPools: 3, predictedProfitChange: 0.4, badge: 'stable' },
          discoveredAt: '2026-03-22T12:00:05.000Z',
        },
      });
    });

    expect(screen.getByRole('button', { name: /resume \(1 new\)/i })).toBeInTheDocument();
    expect(screen.queryAllByText(/arb -> usdc -> arb/i)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /resume \(1 new\)/i }));
    expect(screen.getAllByTestId('opportunity-row')[0]).toHaveTextContent(/arb -> usdc -> arb/i);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(9_700);
    });

    expect(screen.getAllByTestId('opportunity-row')[0]).toHaveAttribute('data-expiring', 'true');

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(screen.queryAllByText(/arb -> usdc -> arb/i)).toHaveLength(0);
  }, 15000);

  it('uses resumable reconnects with jittered backoff and shows an explicit error state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValueOnce(new Error('snapshot failed'));

    renderWithProviders(<OpportunitiesPage />, { route: '/opportunities' });

    expect(await screen.findByRole('heading', { name: /unable to load live opportunities/i })).toBeInTheDocument();
    expect(screen.queryByText(/no profitable opportunities at the moment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/live feed offline/i)).not.toBeInTheDocument();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: opportunitiesResponse, meta: { total: 1, limit: 20 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /retry opportunities/i }));

    expect(await screen.findAllByText(/weth -> usdc -> weth/i)).toHaveLength(2);

    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const firstSocket = MockWebSocket.instances.at(-1)!;

    act(() => {
      firstSocket.open();
      firstSocket.message({
        type: 'connected',
        data: { authenticated: true, connectionId: 'conn-a', resumed: false, resumableUntil: '2026-03-22T12:05:00.000Z' },
      });
      firstSocket.close();
    });

    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    const resumedSocket = MockWebSocket.instances.at(-1)!;
    expect(resumedSocket.url).toContain('resumeConnectionId=conn-a');
  }, 15000);
});
