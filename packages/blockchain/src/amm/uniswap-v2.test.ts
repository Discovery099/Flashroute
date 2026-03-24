import { describe, expect, it } from 'vitest';

import { getUniswapV2SpotPrices } from './uniswap-v2';

describe('getUniswapV2SpotPrices', () => {
  it('normalizes mixed decimals and applies the pool fee', () => {
    expect(
      getUniswapV2SpotPrices({
        reserve0: 1_500_000_000_000_000_000n,
        reserve1: 3_250_000_000n,
        token0Decimals: 18,
        token1Decimals: 6,
        feeBps: 30,
      }),
    ).toEqual({
      token0ToToken1: '2160.166666666666',
      token1ToToken0: '0.000460153846',
    });
  });
});
