import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { StrategyEditPage } from './StrategyEditPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useUiStore } from '@/state/ui.store';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('StrategyEditPage', () => {
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

  it('updates a strategy without sending immutable chainId in the patch payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              strategy: {
                id: 'strategy-1',
                name: 'Editable Strategy',
                chainId: 42161,
                description: 'Old notes',
                isActive: false,
                minProfitUsd: 10,
                maxTradeSizeUsd: 100000,
                maxHops: 4,
                cooldownSeconds: 30,
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
        new Response(JSON.stringify({ success: true, data: { strategy: { id: 'strategy-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    renderWithProviders(
      <Routes>
        <Route path="/strategies/:id/edit" element={<StrategyEditPage />} />
      </Routes>,
      { route: '/strategies/strategy-1/edit' },
    );

    expect(await screen.findByDisplayValue(/editable strategy/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'Edited Strategy' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body)) as Record<string, unknown>;
    expect(payload.name).toBe('Edited Strategy');
    expect(payload).not.toHaveProperty('chainId');
  });
});
