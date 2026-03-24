import { describe, expect, it } from 'vitest';

import { getBalancerAmountOut, getBalancerSpotPrices, normalizeWeights } from './balancer';

describe('balancer helpers', () => {
  it('normalizes integer weights into clean decimals', () => {
    expect(normalizeWeights([800_000n, 200_000n])).toEqual(['0.8', '0.2']);
  });

  it('computes weighted spot prices from balances and weights', () => {
    expect(
      getBalancerSpotPrices({
        balances: [100n * 10n ** 18n, 75_000n * 10n ** 6n],
        tokenDecimals: [18, 6],
        weights: [800_000n, 200_000n],
        feeBps: 30,
        tokenInIndex: 0,
        tokenOutIndex: 1,
      }),
    ).toEqual({
      token0ToToken1: '2991',
      token1ToToken0: '0.000332333333',
    });
  });

  it('supports arbitrary token pairs in a 3-token weighted pool', () => {
    expect(
      getBalancerSpotPrices({
        balances: [100n * 10n ** 18n, 75_000n * 10n ** 6n, 50n * 10n ** 18n],
        tokenDecimals: [18, 6, 18],
        weights: [500_000n, 300_000n, 200_000n],
        feeBps: 30,
        tokenInIndex: 2,
        tokenOutIndex: 1,
      }),
    ).toEqual({
      token0ToToken1: '997',
      token1ToToken0: '0.000997',
    });
  });

  it('keeps precision for realistic large weighted balances', () => {
    expect(
      getBalancerSpotPrices({
        balances: [
          123_456_789_012_345_678_901_234_567_890n,
          987_654_321_098_765_432_109_876n,
          555_555_555_555_555_555_555_555_555n,
        ],
        tokenDecimals: [18, 6, 18],
        weights: [450_000n, 350_000n, 200_000n],
        feeBps: 30,
        tokenInIndex: 0,
        tokenOutIndex: 1,
      }),
    ).toEqual({
      token0ToToken1: '10254857.236304529421',
      token1ToToken0: '0.00000009693',
    });
  });

  it('computes weighted exact-input swap outputs', () => {
    const result = getBalancerAmountOut({
      amountIn: 1n * 10n ** 18n,
      balances: [100n * 10n ** 18n, 75_000n * 10n ** 6n],
      weights: [800_000n, 200_000n],
      feeBps: 30,
      tokenInIndex: 0,
      tokenOutIndex: 1,
    });

    expect(result.amountOut).toBeGreaterThan(2_900n * 10n ** 6n);
    expect(result.amountOut).toBeLessThan(3_100n * 10n ** 6n);
    expect(result.newBalances[0]).toBe(101n * 10n ** 18n);
    expect(result.newBalances[1]).toBeLessThan(75_000n * 10n ** 6n);
  });
});
