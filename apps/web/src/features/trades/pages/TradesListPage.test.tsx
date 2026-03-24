import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { TradesListPage } from './TradesListPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useUiStore } from '@/state/ui.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const tradesPayload = {
  trades: [
    {
      id: 'trade-1',
      chainId: 42161,
      strategyId: 'strategy-1',
      strategyName: 'Arbitrage Alpha',
      status: 'settled',
      routePath: [
        { tokenIn: 'WETH', tokenOut: 'USDC' },
        { tokenIn: 'USDC', tokenOut: 'DAI' },
        { tokenIn: 'DAI', tokenOut: 'WETH' },
      ],
      flashLoanToken: 'WETH',
      flashLoanAmount: '15.0',
      profitUsd: 125.5,
      gasCostUsd: 12.3,
      netProfitUsd: 113.2,
      slippageBps: 15,
      gasUsed: 180000,
      txHash: '0xabc123def456',
      createdAt: '2026-03-22T12:00:00.000Z',
      submittedAt: '2026-03-22T12:00:01.000Z',
      confirmedAt: '2026-03-22T12:00:05.000Z',
      blockNumber: 12345678,
    },
  ],
  meta: { page: 1, limit: 20, total: 1 },
};

describe('TradesListPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'trades-token' });
    useUiStore.setState({
      sidebarCollapsed: false,
      currentModal: null,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      globalBanner: null,
      toasts: [],
    });
  });

  it('renders trades table with all columns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { trades: tradesPayload.trades, meta: tradesPayload.meta } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades" element={<TradesListPage />} />
      </Routes>,
      { route: '/trades' },
    );

    expect(await screen.findByRole('heading', { name: /^trades$/i })).toBeInTheDocument();
    expect(await screen.findByText(/arbitrage alpha/i)).toBeInTheDocument();
    expect(await screen.findByText(/0xabc123def456/i)).toBeInTheDocument();
    expect(screen.getByText(/\$113\.20/i)).toBeInTheDocument();
  });

  it('syncs filters to URL params and resets page on filter change', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { trades: tradesPayload.trades, meta: { ...tradesPayload.meta, page: 1 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades" element={<TradesListPage />} />
      </Routes>,
      { route: '/trades?page=3&limit=20' },
    );

    expect(await screen.findByRole('heading', { name: /^trades$/i })).toBeInTheDocument();

    // First fetch should have been made on mount
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Change the chain filter
    fireEvent.change(screen.getByRole('combobox', { name: /chain/i }), { target: { value: '42161' } });

    // Second fetch should be triggered with new chainId and page=1
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const secondCallUrl = fetchMock.mock.calls[1][0];
    expect(secondCallUrl).toContain('chainId=42161');
    expect(secondCallUrl).toContain('page=1');
    expect(secondCallUrl).not.toContain('page=3');
  });

  it('shows empty state when no trades match filters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { trades: [], meta: { page: 1, limit: 20, total: 0 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades" element={<TradesListPage />} />
      </Routes>,
      { route: '/trades?status=settled' },
    );

    expect(await screen.findByText(/no trades match your current filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('shows explorer link on tx hash column', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { trades: tradesPayload.trades, meta: tradesPayload.meta } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades" element={<TradesListPage />} />
      </Routes>,
      { route: '/trades' },
    );

    expect(await screen.findByText(/0xabc123def456/i)).toBeInTheDocument();
    const explorerLink = screen.getByRole('link', { name: /view on explorer/i });
    expect(explorerLink).toHaveAttribute('href', 'https://arbiscan.io/tx/0xabc123def456');
    expect(explorerLink).toHaveAttribute('target', '_blank');
  });
});
