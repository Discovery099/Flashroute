import { describe, expect, it } from 'vitest';

import { getCurveAmountOut } from './curve';

describe('getCurveAmountOut', () => {
  it('solves the StableSwap invariant precisely for a balanced pool', () => {
    const output = getCurveAmountOut({
      amountIn: 1_000_000n,
      tokenInIndex: 0,
      tokenOutIndex: 2,
      balances: [1_000_000_000n, 1_000_000_000n, 1_000_000_000_000_000_000_000n],
      decimals: [6, 6, 18],
      amplification: 2_000n,
      feeBps: 4,
    });

    expect(output.amountOut).toBeGreaterThan(999_000_000_000_000_000n);
    expect(output.amountOut).toBeLessThan(1_000_000_000_000_000_000n);
    expect(output.newBalances[0]).toBeGreaterThan(1_000_000_000n);
    expect(output.newBalances[2]).toBeLessThan(1_000_000_000_000_000_000_000n);
  });
});
