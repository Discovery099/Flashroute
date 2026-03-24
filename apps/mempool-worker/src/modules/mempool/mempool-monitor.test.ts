import { describe, expect, it } from 'vitest';

import { MempoolMonitor } from './mempool-monitor';

describe('MempoolMonitor', () => {
  it('filters stale pending swaps from active results', () => {
    let now = 10_000;
    const monitor = new MempoolMonitor({ currentBaseFeePerGas: 10n, now: () => now, maxPendingAgeMs: 5_000 });

    monitor.addDecodedSwap({
      txHash: '0xold',
      dex: 'uniswap_v2',
      method: 'swapExactTokensForTokens',
      amountSpecified: 1_000n,
      swaps: [{ tokenIn: 'A', tokenOut: 'B', amountIn: 1_000n, amountOutMin: 900n }],
      sender: '0xsender',
      gasPrice: 30n,
      confidence: 0.5,
      firstSeenAt: 1_000,
    });
    monitor.addDecodedSwap({
      txHash: '0xnew',
      dex: 'uniswap_v2',
      method: 'swapExactTokensForTokens',
      amountSpecified: 1_000n,
      swaps: [{ tokenIn: 'A', tokenOut: 'B', amountIn: 1_000n, amountOutMin: 900n }],
      sender: '0xsender',
      gasPrice: 30n,
      confidence: 0.9,
      firstSeenAt: 8_000,
    });

    expect(monitor.getActivePendingSwaps().map((swap) => swap.txHash)).toEqual(['0xnew']);
    now = 20_000;
    expect(monitor.getActivePendingSwaps()).toEqual([]);
  });
});
