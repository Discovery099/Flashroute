import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { StrategyCreatePage } from './StrategyCreatePage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { useUiStore } from '@/state/ui.store';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('StrategyCreatePage', () => {
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

  it('maps server validation errors back to precise fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: [
              { field: 'allowedDexes', message: 'sushiswap is not supported on chain 42161' },
            ],
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/strategies/new" element={<StrategyCreatePage />} />
      </Routes>,
      { route: '/strategies/new' },
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'Bad strategy' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /sushiswap/i }));
    fireEvent.click(screen.getByRole('button', { name: /create strategy/i }));

    await waitFor(() => {
      expect(screen.getByText(/sushiswap is not supported on chain 42161/i)).toBeInTheDocument();
    });
  });
});
