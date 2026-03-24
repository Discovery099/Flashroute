import { describe, expect, it } from 'vitest';

import { PoolNormalizer } from './pool-normalizer';

describe('PoolNormalizer', () => {
  it('excludes pools with zero reserves', () => {
    const normalizer = new PoolNormalizer();

    const normalized = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xpool-v2',
      dexType: 'uniswap-v2',
      feeBps: 30,
      blockNumber: 101,
      timestamp: 1_700_000_000,
      tokens: [
        { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 0n },
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 3_000_000_000n },
      ],
    });

    expect(normalized).toBeNull();
  });

  it('normalizes mixed token decimals for v2 reserves', () => {
    const normalizer = new PoolNormalizer();

    const normalized = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xpool-mixed',
      dexType: 'uniswap-v2',
      feeBps: 30,
      blockNumber: 102,
      timestamp: 1_700_000_001,
      tokens: [
        { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 1_500_000_000_000_000_000n },
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 3_250_000_000n },
      ],
    });

    expect(normalized).toMatchObject({
      poolAddress: '0xpool-mixed',
      normalizedReserves: ['1.5', '3250'],
      invariant: { kind: 'constant-product' },
      spotPrices: {
        '0xeth->0xusdc': '2160.166666666666',
        '0xusdc->0xeth': '0.000460153846',
      },
    });
  });

  it('preserves v3, curve, and balancer metadata in a uniform shape', () => {
    const normalizer = new PoolNormalizer();

    const v3 = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xpool-v3',
      dexType: 'uniswap-v3',
      feeBps: 5,
      blockNumber: 103,
      timestamp: 1_700_000_002,
      sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
      liquidity: 1_000_000_000_000_000_000n,
      tokens: [
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 1_000_000_000n },
        { address: '0xusdt', symbol: 'USDT', decimals: 6, rawBalance: 1_000_000_000n },
      ],
    });

    const curve = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xpool-curve',
      dexType: 'curve',
      feeBps: 4,
      blockNumber: 104,
      timestamp: 1_700_000_003,
      amplification: 2000n,
      tokens: [
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 1_000_000_000n },
        { address: '0xdai', symbol: 'DAI', decimals: 18, rawBalance: 1_000_000_000_000_000_000_000n },
      ],
    });

    const balancer = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xpool-bal',
      dexType: 'balancer',
      feeBps: 30,
      blockNumber: 105,
      timestamp: 1_700_000_004,
      weights: [800_000n, 200_000n],
      tokens: [
        { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 100n * 10n ** 18n },
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 75_000n * 10n ** 6n },
      ],
    });

    expect(v3?.invariant).toEqual({
      kind: 'concentrated-liquidity',
      liquidity: '1000000000000000000',
      sqrtPriceX96: '79228162514264337593543950336',
    });
    expect(curve?.invariant).toEqual({ kind: 'stable-swap', amplification: '2000' });
    expect(balancer?.invariant).toEqual({ kind: 'weighted-product', weights: ['0.8', '0.2'] });
  });

  it('normalizes a 3-token curve pool into directed graph-ready pairs', () => {
    const normalizer = new PoolNormalizer();

    const normalized = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xcurve-3pool',
      dexType: 'curve',
      feeBps: 4,
      blockNumber: 200,
      timestamp: 1_700_000_100,
      amplification: 4000n,
      tokens: [
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 1_000_000_000n },
        { address: '0xusdt', symbol: 'USDT', decimals: 6, rawBalance: 1_010_000_000n },
        { address: '0xdai', symbol: 'DAI', decimals: 18, rawBalance: 995_000_000_000_000_000_000n },
      ],
    });

    expect(normalized?.directedPairs).toHaveLength(6);
    expect(normalized?.directedPairs).toContainEqual({
      tokenIn: '0xusdc',
      tokenOut: '0xdai',
      spotPrice: '0.999214947058',
      feeBps: 4,
    });
    expect(normalized?.directedPairs).toContainEqual({
      tokenIn: '0xdai',
      tokenOut: '0xusdt',
      spotPrice: '1.000760963644',
      feeBps: 4,
    });
  });

  it('normalizes a 3-token balancer pool into directed graph-ready pairs', () => {
    const normalizer = new PoolNormalizer();

    const normalized = normalizer.normalize({
      chainId: 1,
      poolAddress: '0xbal-3',
      dexType: 'balancer',
      feeBps: 30,
      blockNumber: 201,
      timestamp: 1_700_000_101,
      weights: [500_000n, 300_000n, 200_000n],
      tokens: [
        { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 100n * 10n ** 18n },
        { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 75_000n * 10n ** 6n },
        { address: '0xwbtc', symbol: 'WBTC', decimals: 8, rawBalance: 5n * 10n ** 8n },
      ],
    });

    expect(normalized?.directedPairs).toHaveLength(6);
    expect(normalized?.directedPairs).toContainEqual({
      tokenIn: '0xwbtc',
      tokenOut: '0xusdc',
      spotPrice: '9970',
      feeBps: 30,
    });
    expect(normalized?.directedPairs).toContainEqual({
      tokenIn: '0xusdc',
      tokenOut: '0xeth',
      spotPrice: '0.0007976',
      feeBps: 30,
    });
  });
});
