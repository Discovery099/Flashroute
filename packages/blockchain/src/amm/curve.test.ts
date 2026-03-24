import { describe, expect, it } from 'vitest';

import { getCurveSpotPrice } from './curve';

describe('getCurveSpotPrice', () => {
  it('keeps balanced stable pools near parity while preserving the fee', () => {
    expect(
      getCurveSpotPrice({
        balances: [1_000_000_000n, 1_000_000_000_000_000_000_000n],
        tokenDecimals: [6, 18],
        amplification: 2000n,
        feeBps: 4,
        tokenInIndex: 0,
        tokenOutIndex: 1,
      }),
    ).toEqual({
      token0ToToken1: '0.9996',
      token1ToToken0: '0.9996',
    });
  });

  it('supports arbitrary token pairs in a 3-token stable pool and uses amplification', () => {
    const lowAmplification = getCurveSpotPrice({
      balances: [1_000_000_000n, 1_050_000_000n, 980_000_000_000_000_000_000n],
      tokenDecimals: [6, 6, 18],
      amplification: 100n,
      feeBps: 4,
      tokenInIndex: 0,
      tokenOutIndex: 2,
    });

    const highAmplification = getCurveSpotPrice({
      balances: [1_000_000_000n, 1_050_000_000n, 980_000_000_000_000_000_000n],
      tokenDecimals: [6, 6, 18],
      amplification: 5000n,
      feeBps: 4,
      tokenInIndex: 0,
      tokenOutIndex: 2,
    });

    expect(lowAmplification.token0ToToken1).toBe('0.98418632061');
    expect(Number(highAmplification.token0ToToken1)).toBeGreaterThan(Number(lowAmplification.token0ToToken1));
    expect(Number(highAmplification.token0ToToken1)).toBeLessThan(1);
  });
});
