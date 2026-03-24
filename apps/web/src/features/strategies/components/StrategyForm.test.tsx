import { fireEvent, render, screen } from '@testing-library/react';
import { StrategyForm } from './StrategyForm';
import { useUiStore } from '@/state/ui.store';

describe('StrategyForm', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarCollapsed: false,
      currentModal: null,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      globalBanner: null,
      toasts: [],
    });
  });

  it('deselects DEXes unsupported by the newly selected chain and shows a warning toast', () => {
    render(
      <StrategyForm
        mode="create"
        onSubmit={vi.fn()}
        defaultValues={{
          name: 'Dex Reset Strategy',
          chainId: 1,
          minProfitUsd: 10,
          maxHops: 4,
          riskBufferPct: 0.5,
          maxSlippageBps: 50,
          allowedDexes: ['uniswap_v2', 'curve'],
        }}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /curve/i })).toBeChecked();

    fireEvent.change(screen.getByRole('combobox', { name: /chain/i }), {
      target: { value: '42161' },
    });

    expect(screen.getByRole('checkbox', { name: /curve/i })).not.toBeChecked();
    expect(useUiStore.getState().toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tone: 'warning',
          title: expect.stringMatching(/dex selection updated/i),
        }),
      ]),
    );
  });

  it('warns before unload when the form has unsaved changes', () => {
    render(
      <StrategyForm
        mode="create"
        onSubmit={vi.fn()}
        defaultValues={{
          name: '',
          chainId: 42161,
          minProfitUsd: 10,
          maxHops: 4,
          riskBufferPct: 0.5,
          maxSlippageBps: 50,
          allowedDexes: ['uniswap_v3'],
        }}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Changed strategy' },
    });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
