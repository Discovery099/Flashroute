import { describe, expect, it } from 'vitest';

import { ProfitSimulator } from './profit-simulator';

describe('ProfitSimulator', () => {
  it('keeps state continuity when a route reuses the same pool', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 50,
      congestionRiskBps: 25,
      gasBufferMultiplier: 1,
    });

    const route = {
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'aave', feeBps: 5, gasOverhead: 250_000 }],
      pools: {
        loop: {
          dexType: 'uniswap-v2' as const,
          feeBps: 30,
          token0: 'A',
          token1: 'B',
          reserve0: 100_000n,
          reserve1: 130_000n,
        },
      },
      path: [
        { poolAddress: 'loop', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'loop', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    };

    const result = simulator.simulate(route, {
      amountIn: 1_000n,
      gasPriceWei: 1_000_000n,
      ethUsdPrice: 3_000,
      congestionLevel: 0.2,
    });

    expect(result.hops).toHaveLength(2);
    expect('reserve0' in result.hops[1]!.poolSnapshotBefore && result.hops[1]!.poolSnapshotBefore.reserve0).not.toBe(100_000n);
    expect('reserve1' in result.hops[1]!.poolSnapshotBefore && result.hops[1]!.poolSnapshotBefore.reserve1).not.toBe(130_000n);
  });

  it('simulates a profitable 2-hop route', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate(
      {
        sourceToken: 'A',
        usdPerSourceToken: 1,
        flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
        pools: {
          buy: {
            dexType: 'uniswap-v2' as const,
            feeBps: 30,
            token0: 'A',
            token1: 'B',
            reserve0: 200_000n,
            reserve1: 260_000n,
          },
          sell: {
            dexType: 'uniswap-v2' as const,
            feeBps: 30,
            token0: 'B',
            token1: 'A',
            reserve0: 260_000n,
            reserve1: 230_000n,
          },
        },
        path: [
          { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
          { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
        ],
      },
      {
        amountIn: 1_000n,
        gasPriceWei: 100_000n,
        ethUsdPrice: 3_000,
        congestionLevel: 0.1,
      },
    );

    expect(result.netProfitUsd).toBeGreaterThan(0);
    expect(result.profitable).toBe(true);
  });

  it('uses the precise stable-swap solver for Curve paths', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate(
      {
        sourceToken: 'USDC',
        usdPerSourceToken: 1,
        flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
        pools: {
          stable: {
            dexType: 'curve' as const,
            feeBps: 4,
            amplification: 2_000n,
            tokens: ['USDC', 'USDT', 'DAI'],
            balances: [1_000_000_000n, 1_000_000_000n, 1_000_000_000_000_000_000_000n],
            decimals: [6, 6, 18],
          },
        },
        path: [{ poolAddress: 'stable', tokenIn: 'USDC', tokenOut: 'DAI', dexType: 'curve' as const }],
      },
      {
        amountIn: 1_000_000n,
        gasPriceWei: 100_000n,
        ethUsdPrice: 3_000,
        congestionLevel: 0,
      },
    );

    expect(result.hops[0]!.amountOut).toBeGreaterThan(999_000_000_000_000_000n);
    expect(result.hops[0]!.amountOut).toBeLessThan(1_000_000_000_000_000_000n);
  });

  it('searches for an input size near the profit peak', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 20,
      gasBufferMultiplier: 1,
    });

    const route = {
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
      pools: {
        buy: {
          dexType: 'uniswap-v2' as const,
          feeBps: 30,
          token0: 'A',
          token1: 'B',
          reserve0: 200_000n,
          reserve1: 260_000n,
        },
        sell: {
          dexType: 'uniswap-v2' as const,
          feeBps: 30,
          token0: 'B',
          token1: 'A',
          reserve0: 260_000n,
          reserve1: 230_000n,
        },
      },
      path: [
        { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    };

    const optimum = simulator.searchOptimalInput(route, {
      minAmountIn: 500n,
      maxAmountIn: 40_000n,
      tolerance: 25n,
      gasPriceWei: 100_000n,
      ethUsdPrice: 3_000,
      congestionLevel: 0.1,
    });

    expect(optimum.amountIn).toBeGreaterThan(500n);
    expect(optimum.amountIn).toBeLessThan(40_000n);
    expect(optimum.netProfitUsd).toBeGreaterThan(0);
  });

  it('records the correct amount in and out for each hop', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate({
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
      pools: {
        buy: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'A', token1: 'B', reserve0: 100_000n, reserve1: 140_000n },
        sell: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'B', token1: 'A', reserve0: 140_000n, reserve1: 120_000n },
      },
      path: [
        { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    }, {
      amountIn: 1_500n,
      gasPriceWei: 100_000n,
      ethUsdPrice: 3_000,
      congestionLevel: 0,
    });

    expect(result.hops[0]!.amountIn).toBe(1_500n);
    expect(result.hops[1]!.amountIn).toBe(result.hops[0]!.amountOut);
  });

  it('marks routes unprofitable after gas and scales risk buffer with congestion', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 50,
      congestionRiskBps: 100,
      gasBufferMultiplier: 1,
    });

    const route = {
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'aave', feeBps: 5, gasOverhead: 250_000 }],
      pools: {
        buy: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'A', token1: 'B', reserve0: 1_000_000n, reserve1: 1_001_000n },
        sell: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'B', token1: 'A', reserve0: 1_001_000n, reserve1: 1_000_500n },
      },
      path: [
        { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    };

    const calm = simulator.simulate(route, { amountIn: 10_000n, gasPriceWei: 1_000_000_000n, ethUsdPrice: 3_000, congestionLevel: 0 });
    const congested = simulator.simulate(route, { amountIn: 10_000n, gasPriceWei: 1_000_000_000n, ethUsdPrice: 3_000, congestionLevel: 1 });

    expect(calm.profitable).toBe(false);
    expect(congested.profitable).toBe(false);
    expect(congested.riskBufferUsd).toBeGreaterThan(calm.riskBufferUsd);
  });

  it('applies demand prediction reserve overlays during simulation', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const route = {
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
      pools: {
        buy: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'A', token1: 'B', reserve0: 200_000n, reserve1: 260_000n },
        sell: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'B', token1: 'A', reserve0: 260_000n, reserve1: 230_000n },
      },
      path: [
        { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    };

    const baseline = simulator.simulate(route, { amountIn: 1_000n, gasPriceWei: 100_000n, ethUsdPrice: 3_000, congestionLevel: 0.1 });
    const predicted = simulator.simulate({
      ...route,
      predictedPools: {
        sell: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'B', token1: 'A', reserve0: 220_000n, reserve1: 270_000n },
      },
    }, { amountIn: 1_000n, gasPriceWei: 100_000n, ethUsdPrice: 3_000, congestionLevel: 0.1 });

    expect(predicted.netProfitUsd).not.toBe(baseline.netProfitUsd);
  });

  it('selects the cost-aware flash-loan provider for the simulated trade size', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate({
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [
        { name: 'aave', feeBps: 5, gasOverhead: 250_000 },
        { name: 'balancer', feeBps: 0, gasOverhead: 500_000 },
      ],
      pools: {
        buy: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'A', token1: 'B', reserve0: 200_000n, reserve1: 260_000n },
        sell: { dexType: 'uniswap-v2' as const, feeBps: 30, token0: 'B', token1: 'A', reserve0: 260_000n, reserve1: 230_000n },
      },
      path: [
        { poolAddress: 'buy', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v2' as const },
        { poolAddress: 'sell', tokenIn: 'B', tokenOut: 'A', dexType: 'uniswap-v2' as const },
      ],
    }, { amountIn: 500n, gasPriceWei: 10_000_000_000n, ethUsdPrice: 3_000, congestionLevel: 0 });

    expect(result.provider.name).toBe('aave');
  });

  it('supports Balancer hop simulation', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate({
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
      pools: {
        weighted: {
          dexType: 'balancer' as const,
          feeBps: 30,
          tokens: ['A', 'B'],
          balances: [100_000n, 75_000n],
          weights: [800_000n, 200_000n],
        },
      },
      path: [{ poolAddress: 'weighted', tokenIn: 'A', tokenOut: 'B', dexType: 'balancer' as const }],
    }, { amountIn: 1_000n, gasPriceWei: 100_000n, ethUsdPrice: 3_000, congestionLevel: 0 });

    expect(result.hops[0]!.amountOut).toBeGreaterThan(0n);
    expect(result.totalGas).toBeGreaterThan(300_000);
  });

  it('supports Uniswap V3 hop simulation', () => {
    const simulator = new ProfitSimulator({
      nativeTokenUsdPrice: 3_000,
      riskBufferBaseBps: 10,
      congestionRiskBps: 10,
      gasBufferMultiplier: 1,
    });

    const result = simulator.simulate({
      sourceToken: 'A',
      usdPerSourceToken: 1,
      flashLoanProviders: [{ name: 'balancer', feeBps: 0, gasOverhead: 180_000 }],
      pools: {
        concentrated: {
          dexType: 'uniswap-v3' as const,
          feeBps: 30,
          token0: 'A',
          token1: 'B',
          reserve0: 100_000n,
          reserve1: 120_000n,
          sqrtPriceX96: 79_228_162_514_264_337_593_543_950_336n,
          liquidity: 1_000_000n,
        },
      },
      path: [{ poolAddress: 'concentrated', tokenIn: 'A', tokenOut: 'B', dexType: 'uniswap-v3' as const }],
    }, { amountIn: 1_000n, gasPriceWei: 100_000n, ethUsdPrice: 3_000, congestionLevel: 0 });

    expect(result.hops[0]!.amountOut).toBeGreaterThan(0n);
    expect(result.totalGas).toBeGreaterThan(350_000);
  });
});
