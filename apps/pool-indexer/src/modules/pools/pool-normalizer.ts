import {
  getBalancerSpotPrices,
  getCurveSpotPrice,
  getUniswapV2SpotPrices,
  getUniswapV3SpotPrice,
  normalizeAmount,
  normalizeWeights,
} from '@flashroute/blockchain';

import type { NormalizedPoolPair, NormalizedPoolState, NormalizedPoolToken, RawPoolState } from './pool-types';

export class PoolNormalizer {
  normalize(pool: RawPoolState): NormalizedPoolState | null {
    if (pool.tokens.some((token) => token.rawBalance <= 0n)) {
      return null;
    }

    const tokens: NormalizedPoolToken[] = pool.tokens.map((token, index) => ({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      rawBalance: token.rawBalance.toString(),
      normalizedBalance: normalizeAmount({ raw: token.rawBalance, decimals: token.decimals }),
      normalizedWeight: pool.weights ? normalizeWeights(pool.weights)[index] : undefined,
    }));
    const normalizedReserves = tokens.map((token) => token.normalizedBalance);
    const spotPrices = this.buildSpotPrices(pool);

    return {
      chainId: pool.chainId,
      poolAddress: pool.poolAddress,
      dexType: pool.dexType,
      feeBps: pool.feeBps,
      blockNumber: pool.blockNumber,
      timestamp: pool.timestamp,
      tokens,
      normalizedReserves,
      spotPrices,
      directedPairs: this.buildDirectedPairs(pool),
      invariant: this.buildInvariant(pool),
    };
  }

  private buildSpotPrices(pool: RawPoolState): Record<string, string> {
    return Object.fromEntries(
      this.buildDirectedPairs(pool).map((pair) => [`${pair.tokenIn}->${pair.tokenOut}`, pair.spotPrice]),
    );
  }

  private buildDirectedPairs(pool: RawPoolState): NormalizedPoolPair[] {
    const pairs: NormalizedPoolPair[] = [];

    for (let tokenInIndex = 0; tokenInIndex < pool.tokens.length; tokenInIndex += 1) {
      for (let tokenOutIndex = 0; tokenOutIndex < pool.tokens.length; tokenOutIndex += 1) {
        if (tokenInIndex === tokenOutIndex) {
          continue;
        }

        const tokenIn = pool.tokens[tokenInIndex];
        const tokenOut = pool.tokens[tokenOutIndex];
        if (!tokenIn || !tokenOut) {
          continue;
        }

        const prices = this.getPairPrices(pool, tokenInIndex, tokenOutIndex);
        pairs.push({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          spotPrice: prices.token0ToToken1,
          feeBps: pool.feeBps,
        });
      }
    }

    return pairs;
  }

  private getPairPrices(pool: RawPoolState, tokenInIndex: number, tokenOutIndex: number): { token0ToToken1: string; token1ToToken0: string } {
    const tokenIn = pool.tokens[tokenInIndex];
    const tokenOut = pool.tokens[tokenOutIndex];

    if (!tokenIn || !tokenOut) {
      return { token0ToToken1: '0', token1ToToken0: '0' };
    }

    switch (pool.dexType) {
      case 'uniswap-v2':
        return getUniswapV2SpotPrices({
          reserve0: tokenIn.rawBalance,
          reserve1: tokenOut.rawBalance,
          token0Decimals: tokenIn.decimals,
          token1Decimals: tokenOut.decimals,
          feeBps: pool.feeBps,
        });
      case 'uniswap-v3':
        return getUniswapV3SpotPrice({
          sqrtPriceX96: pool.sqrtPriceX96 ?? 0n,
          token0Decimals: tokenIn.decimals,
          token1Decimals: tokenOut.decimals,
        });
      case 'curve':
        return getCurveSpotPrice({
          balances: pool.tokens.map((token) => token.rawBalance),
          tokenDecimals: pool.tokens.map((token) => token.decimals),
          amplification: pool.amplification ?? 0n,
          feeBps: pool.feeBps,
          tokenInIndex,
          tokenOutIndex,
        });
      case 'balancer':
        return getBalancerSpotPrices({
          balances: pool.tokens.map((token) => token.rawBalance),
          tokenDecimals: pool.tokens.map((token) => token.decimals),
          weights: pool.weights ?? [],
          feeBps: pool.feeBps,
          tokenInIndex,
          tokenOutIndex,
        });
    }
  }

  private buildInvariant(pool: RawPoolState): NormalizedPoolState['invariant'] {
    switch (pool.dexType) {
      case 'uniswap-v2':
        return { kind: 'constant-product' };
      case 'uniswap-v3':
        return {
          kind: 'concentrated-liquidity',
          liquidity: (pool.liquidity ?? 0n).toString(),
          sqrtPriceX96: (pool.sqrtPriceX96 ?? 0n).toString(),
        };
      case 'curve':
        return {
          kind: 'stable-swap',
          amplification: (pool.amplification ?? 0n).toString(),
        };
      case 'balancer':
        return {
          kind: 'weighted-product',
          weights: normalizeWeights(pool.weights ?? []),
        };
    }
  }
}
