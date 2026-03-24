import { describe, expect, it } from 'vitest';

import { getUniswapV3AmountOut, getUniswapV3SpotPrice } from './uniswap-v3';

describe('getUniswapV3SpotPrice', () => {
  it('derives a 1:1 price from sqrtPriceX96', () => {
    expect(
      getUniswapV3SpotPrice({
        sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
        token0Decimals: 6,
        token1Decimals: 6,
      }),
    ).toEqual({
      token0ToToken1: '1',
      token1ToToken0: '1',
    });
  });

  it('preserves precision for large sqrtPriceX96 values without Number rounding', () => {
    const result = getUniswapV3SpotPrice({
      sqrtPriceX96: 1766847064778384329583297500742918515827483896875618958n,
      token0Decimals: 18,
      token1Decimals: 6,
    });

    expect(result.token0ToToken1).not.toContain('e');
    expect(result.token0ToToken1).toMatch(/^\d+\.\d+$/);
    expect(result.token0ToToken1.startsWith('497323236409786642155382248146820840100456150797347717372005771')).toBe(true);
  });

  it('simulates exact-input swaps with reserve continuity for a simplified v3 pool', () => {
    const result = getUniswapV3AmountOut({
      amountIn: 1_000n,
      reserveIn: 100_000n,
      reserveOut: 120_000n,
      feeBps: 30,
      sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
      liquidity: 1_000_000n,
    });

    expect(result.amountOut).toBeGreaterThan(0n);
    expect(result.reserveInAfter).toBeGreaterThan(100_000n);
    expect(result.reserveOutAfter).toBeLessThan(120_000n);
  });
});
