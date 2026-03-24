import { describe, expect, it } from 'vitest';

import { createMempoolWorker } from './bootstrap';

describe('createMempoolWorker', () => {
  it('wires monitor, predictor, and pending-swap projection pipeline', () => {
    const worker = createMempoolWorker({
      now: () => 2_000,
      currentBaseFeePerGas: 10n,
      confidenceThreshold: 0.25,
      maxPendingAgeMs: 60_000,
      poolResolver: ({ tokenIn, tokenOut, dex }) => dex === 'uniswap-v2' && tokenIn === 'A' && tokenOut === 'B'
        ? { poolAddress: 'pool-1', dexType: 'uniswap-v2' as const }
        : null,
    });

    worker.predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'pool-1',
      dexType: 'uniswap-v2',
      feeBps: 30,
      token0: 'A',
      token1: 'B',
      reserve0: 1_000_000n,
      reserve1: 1_000_000n,
    });

    worker.handleDecodedSwap({
      txHash: '0x1',
      dex: 'uniswap_v2',
      method: 'swapExactTokensForTokens',
      amountSpecified: 1_000n,
      swaps: [{ tokenIn: 'A', tokenOut: 'B', amountIn: 1_000n, amountOutMin: 900n }],
      sender: '0xsender',
      gasPrice: 30n,
      confidence: 0.9,
      firstSeenAt: 1_000,
    }, 1);

    const predictions = worker.runPredictionCycle();

    expect(worker.monitor.getActivePendingSwaps()).toHaveLength(1);
    expect(predictions).toHaveLength(1);
    expect(predictions[0]!.poolAddress).toBe('pool-1');
  });
});
