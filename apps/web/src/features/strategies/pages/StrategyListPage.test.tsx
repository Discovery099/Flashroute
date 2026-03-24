import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { StrategyListPage } from './StrategyListPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useUiStore } from '@/state/ui.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const strategiesPayload = {
  strategies: [
    {
      id: 'strategy-1',
      name: 'Arbitrum Alpha',
      description: 'Alpha strategy',
      chainId: 42161,
      isActive: false,
      minProfitUsd: 10,
      maxTradeSizeUsd: 100000,
      maxHops: 4,
      cooldownSeconds: 30,
      riskBufferPct: 0.5,
      maxGasPriceGwei: 100,
      maxSlippageBps: 50,
      flashLoanProvider: 'auto',
      executionCount: 14,
      totalProfitUsd: 240.12,
      lastRunAt: '2026-03-22T12:00:00.000Z',
      allowedDexes: ['uniswap_v3'],
      createdAt: '2026-03-22T12:00:00.000Z',
    },
  ],
};

describe('StrategyListPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'strategy-token' });
    useUiStore.setState({
      sidebarCollapsed: false,
      currentModal: null,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      globalBanner: null,
      toasts: [],
    });
  });

  it('rolls back an optimistic activation toggle when the mutation fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 1, limit: 20, total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Activation failed' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    renderWithProviders(<StrategyListPage />, { route: '/strategies' });

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: /toggle strategy arbitrum alpha/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    expect(useUiStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tone: 'warning',
          description: expect.stringMatching(/activation failed/i),
        }),
      ]),
    );
  });

  it('uses spec query params for search, chainId, status, page, and limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 2, limit: 1, total: 3 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<StrategyListPage />, { route: '/strategies?page=2&limit=1&chainId=42161&status=draft&search=Arb' });

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/strategies?page=2&limit=1&chainId=42161&status=draft&search=Arb'),
      expect.any(Object),
    );
  });

  it('resets page to 1 when filters change', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 1, limit: 20, total: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/strategies" element={<StrategyListPage />} />
      </Routes>,
      { route: '/strategies?page=3&limit=20' },
    );

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /chain filter/i }), { target: { value: '42161' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/v1/strategies?page=1&limit=20&chainId=42161'),
        expect.any(Object),
      );
    });
  });

  it('confirms before deleting from the list actions', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 1, limit: 20, total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { message: 'Strategy deleted' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<StrategyListPage />, { route: '/strategies' });

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/strategies/strategy-1?confirm=true'))).toBe(true);
    });
  });

  it('shows flash provider and last run columns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 1, limit: 20, total: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<StrategyListPage />, { route: '/strategies' });

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /flash provider/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /last run/i })).toBeInTheDocument();
    expect(screen.getByText(/^auto$/i)).toBeInTheDocument();
    expect(screen.getByText(/2026/i)).toBeInTheDocument();
  });

  it('supports all, active, paused, and draft status filter values in the request contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: strategiesPayload, meta: { page: 1, limit: 20, total: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(<StrategyListPage />, { route: '/strategies' });

    expect(await screen.findByText(/arbitrum alpha/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /status filter/i }), { target: { value: 'paused' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/v1/strategies?page=1&limit=20&status=paused'),
        expect.any(Object),
      );
    });
  });
});
