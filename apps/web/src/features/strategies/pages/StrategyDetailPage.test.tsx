import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { StrategyDetailPage } from './StrategyDetailPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('StrategyDetailPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'strategy-token' });
  });

  it('renders detail data with duplicate action and strategy-filtered history foundation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            strategy: {
              id: 'strategy-1',
              name: 'Detail Strategy',
              chainId: 42161,
              description: 'Strategy detail notes',
              isActive: true,
              minProfitUsd: 11,
              maxTradeSizeUsd: 150000,
              maxHops: 5,
              cooldownSeconds: 60,
              riskBufferPct: 0.8,
              maxGasPriceGwei: 90,
              maxSlippageBps: 44,
              allowedDexes: ['uniswap_v3', 'sushiswap'],
              flashLoanProvider: 'balancer',
              useFlashbots: false,
              useDemandPrediction: true,
              executionCount: 22,
              totalProfitUsd: 4200.22,
              lastRunAt: null,
              createdAt: '2026-03-22T12:00:00.000Z',
              updatedAt: '2026-03-22T12:10:00.000Z',
            },
            performance: {
              executionCount: 22,
              totalProfitUsd: 4200.22,
              successRate: 0.77,
              averageProfitUsd: 190.92,
              bestTradeUsd: 450.11,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/strategies/:id" element={<StrategyDetailPage />} />
      </Routes>,
      { route: '/strategies/strategy-1' },
    );

    expect(await screen.findByRole('heading', { name: /detail strategy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /duplicate/i })).toHaveAttribute('href', '/strategies/new');
    expect(screen.getByText(/strategy detail notes/i)).toBeInTheDocument();
    expect(screen.getByText(/trade history is filtered to this strategy/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /performance trend/i })).toBeInTheDocument();
  });

  it('confirms before deleting from the detail page', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              strategy: {
                id: 'strategy-1',
                name: 'Delete Detail Strategy',
                chainId: 42161,
                description: '',
                isActive: false,
                minProfitUsd: 10,
                maxTradeSizeUsd: 100000,
                maxHops: 4,
                cooldownSeconds: 0,
                riskBufferPct: 0.5,
                maxGasPriceGwei: 100,
                maxSlippageBps: 50,
                allowedDexes: ['uniswap_v3'],
                flashLoanProvider: 'auto',
                useFlashbots: true,
                useDemandPrediction: true,
                executionCount: 0,
                totalProfitUsd: 0,
                lastRunAt: null,
                createdAt: '2026-03-22T12:00:00.000Z',
                updatedAt: '2026-03-22T12:00:00.000Z',
              },
              performance: { executionCount: 0, totalProfitUsd: 0, successRate: 0, averageProfitUsd: 0, bestTradeUsd: 0 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { message: 'Strategy deleted' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(
      <Routes>
        <Route path="/strategies/:id" element={<StrategyDetailPage />} />
      </Routes>,
      { route: '/strategies/strategy-1' },
    );

    expect(await screen.findByRole('heading', { name: /delete detail strategy/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
