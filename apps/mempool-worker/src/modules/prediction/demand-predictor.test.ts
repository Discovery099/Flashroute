import { describe, expect, it } from 'vitest';

import { DemandPredictor } from './demand-predictor';

describe('DemandPredictor', () => {
  it('applies projected reserve overlays without mutating base state', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      feeBps: 30,
      token0: 'A',
      token1: 'B',
      reserve0: 1_000_000n,
      reserve1: 1_000_000n,
    });

    predictor.ingestPendingSwap({
      txHash: '0xswap-1',
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      tokenIn: 'A',
      tokenOut: 'B',
      amountIn: 100_000n,
      amountOutMin: 0n,
      confidence: 0.8,
      gasPriorityScore: 0.9,
      firstSeenAt: 1_000,
    });

    const [prediction] = predictor.recalculate({ now: 2_000 });
    const basePool = predictor.getBasePool('pool-v2');

    expect(basePool).toMatchObject({ reserve0: 1_000_000n, reserve1: 1_000_000n });
    expect(prediction.predictedReserves.reserve0).toBeGreaterThan(basePool!.reserve0);
    expect(prediction.predictedReserves.reserve1).toBeLessThan(basePool!.reserve1);
    expect(prediction.contributingTxs).toEqual(['0xswap-1']);
  });

  it('scores newer high-priority transactions above stale low-priority ones', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0, maxPendingAgeMs: 60_000 });

    const strong = predictor.calculateConfidenceScore({
      gasPrice: 80n,
      maxPriorityFeePerGas: 15n,
      firstSeenAt: 1_900,
      now: 2_000,
      currentBaseFeePerGas: 20n,
    });

    const weak = predictor.calculateConfidenceScore({
      gasPrice: 21n,
      maxPriorityFeePerGas: 1n,
      firstSeenAt: 1_000,
      now: 2_000,
      currentBaseFeePerGas: 20n,
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.7);
    expect(weak).toBeLessThan(0.4);
  });

  it('cleans overlays for transactions confirmed in a block', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      feeBps: 30,
      token0: 'A',
      token1: 'B',
      reserve0: 1_000_000n,
      reserve1: 1_000_000n,
    });

    predictor.ingestPendingSwap({
      txHash: '0xconfirmed',
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      tokenIn: 'A',
      tokenOut: 'B',
      amountIn: 50_000n,
      amountOutMin: 0n,
      confidence: 0.9,
      gasPriorityScore: 0.9,
      firstSeenAt: 1_000,
    });

    expect(predictor.recalculate({ now: 2_000 })).toHaveLength(1);

    predictor.removeConfirmedTransactions(['0xconfirmed']);

    expect(predictor.recalculate({ now: 2_100 })).toHaveLength(0);
    expect(predictor.getOverlayPool('pool-v2')).toBeUndefined();
  });

  it('aggregates cumulative impact for multiple pending swaps on the same pool', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      feeBps: 30,
      token0: 'A',
      token1: 'B',
      reserve0: 1_000_000n,
      reserve1: 1_000_000n,
    });

    predictor.ingestPendingSwap({
      txHash: '0x1',
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      tokenIn: 'A',
      tokenOut: 'B',
      amountIn: 50_000n,
      amountOutMin: 0n,
      confidence: 0.8,
      gasPriorityScore: 0.8,
      firstSeenAt: 1_000,
    });
    predictor.ingestPendingSwap({
      txHash: '0x2',
      chainId: 1,
      poolAddress: 'pool-v2',
      dexType: 'uniswap-v2',
      tokenIn: 'A',
      tokenOut: 'B',
      amountIn: 75_000n,
      amountOutMin: 0n,
      confidence: 0.7,
      gasPriorityScore: 0.7,
      firstSeenAt: 1_000,
    });

    const [prediction] = predictor.recalculate({ now: 2_000 });

    expect(prediction.pendingSwapCount).toBe(2);
    expect(prediction.contributingTxs).toEqual(['0x1', '0x2']);
    expect(prediction.predictedReserves.reserve0).toBeGreaterThan(1_100_000n);
    expect(prediction.predictedReserves.reserve1).toBeLessThan(900_000n);
  });

  it('keys pools by chain id and exposes active predictions plus overlay application', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({ chainId: 1, poolAddress: 'shared', dexType: 'uniswap-v2', feeBps: 30, token0: 'A', token1: 'B', reserve0: 1_000_000n, reserve1: 1_000_000n });
    predictor.upsertBasePool({ chainId: 42161, poolAddress: 'shared', dexType: 'uniswap-v2', feeBps: 30, token0: 'A', token1: 'B', reserve0: 2_000_000n, reserve1: 2_000_000n });

    predictor.ingestPendingSwap({ txHash: '0xmainnet', chainId: 1, poolAddress: 'shared', dexType: 'uniswap-v2', tokenIn: 'A', tokenOut: 'B', amountIn: 10_000n, amountOutMin: 0n, confidence: 0.9, gasPriorityScore: 0.9, firstSeenAt: 1_000 });
    predictor.ingestPendingSwap({ txHash: '0xarb', chainId: 42161, poolAddress: 'shared', dexType: 'uniswap-v2', tokenIn: 'A', tokenOut: 'B', amountIn: 20_000n, amountOutMin: 0n, confidence: 0.9, gasPriorityScore: 0.9, firstSeenAt: 1_000 });

    const predictions = predictor.recalculate({ now: 2_000 });
    const active = predictor.getActivePredictions(1);
    const overlaid = predictor.applyPredictionsToPools(1, [
      { chainId: 1, poolAddress: 'shared', reserve0: 1_000_000n, reserve1: 1_000_000n },
      { chainId: 42161, poolAddress: 'shared', reserve0: 2_000_000n, reserve1: 2_000_000n },
    ]);

    expect(predictions).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0]!.chainId).toBe(1);
    expect(predictor.getOverlayPool(1, 'shared')?.predictedReserves.reserve0).not.toBe(
      predictor.getOverlayPool(42161, 'shared')?.predictedReserves.reserve0,
    );
    expect(overlaid).toEqual([
      expect.objectContaining({ chainId: 1, reserve0: active[0]!.predictedReserves.reserve0, reserve1: active[0]!.predictedReserves.reserve1 }),
      expect.objectContaining({ chainId: 42161, reserve0: 2_000_000n, reserve1: 2_000_000n }),
    ]);
  });

  it('applies overlays for balancer pools and exposes graph-oriented reserve updates', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'weighted',
      dexType: 'balancer',
      feeBps: 30,
      token0: 'A',
      token1: 'B',
      reserve0: 100_000n,
      reserve1: 75_000n,
      weights: [800_000n, 200_000n],
    } as never);

    predictor.ingestPendingSwap({
      txHash: '0xbalancer',
      chainId: 1,
      poolAddress: 'weighted',
      dexType: 'balancer',
      tokenIn: 'A',
      tokenOut: 'B',
      amountIn: 1_000n,
      amountOutMin: 0n,
      confidence: 0.9,
      gasPriorityScore: 0.9,
      firstSeenAt: 1_000,
    });

    predictor.recalculate({ now: 2_000 });
    const graphOverlay = predictor.applyPredictionsToGraphInputs(1, [
      { chainId: 1, poolAddress: 'weighted', reserve0: 100_000n, reserve1: 75_000n, edgeKey: 'A:B:weighted' },
    ]);

    expect(graphOverlay[0]!.reserve0).toBeGreaterThan(100_000n);
    expect(graphOverlay[0]!.reserve1).toBeLessThan(75_000n);
  });

  it('drops stale swaps across pools during recalculation breadth', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 2_000 });

    predictor.upsertBasePool({ chainId: 1, poolAddress: 'p1', dexType: 'uniswap-v2', feeBps: 30, token0: 'A', token1: 'B', reserve0: 100_000n, reserve1: 100_000n });
    predictor.upsertBasePool({ chainId: 1, poolAddress: 'p2', dexType: 'uniswap-v2', feeBps: 30, token0: 'A', token1: 'B', reserve0: 100_000n, reserve1: 100_000n });

    predictor.ingestPendingSwap({ txHash: '0xstale', chainId: 1, poolAddress: 'p1', dexType: 'uniswap-v2', tokenIn: 'A', tokenOut: 'B', amountIn: 1_000n, amountOutMin: 0n, confidence: 0.9, gasPriorityScore: 0.9, firstSeenAt: 0 });
    predictor.ingestPendingSwap({ txHash: '0xfresh', chainId: 1, poolAddress: 'p2', dexType: 'uniswap-v2', tokenIn: 'A', tokenOut: 'B', amountIn: 1_000n, amountOutMin: 0n, confidence: 0.9, gasPriorityScore: 0.9, firstSeenAt: 1_500 });

    const predictions = predictor.recalculate({ now: 2_000 });

    expect(predictions).toHaveLength(1);
    expect(predictions[0]!.poolAddress).toBe('p2');
  });

  it('projects curve pool overlays with predicted reserve updates', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({
      chainId: 1,
      poolAddress: 'curve-1',
      dexType: 'curve',
      feeBps: 4,
      token0: 'USDC',
      token1: 'DAI',
      reserve0: 1_000_000_000n,
      reserve1: 1_000_000_000_000_000_000_000n,
      amplification: 2_000n,
      tokenDecimals: [6, 18],
      tokens: ['USDC', 'DAI'],
    } as never);

    predictor.ingestPendingSwap({
      txHash: '0xcurve-pending',
      chainId: 1,
      poolAddress: 'curve-1',
      dexType: 'curve',
      tokenIn: 'USDC',
      tokenOut: 'DAI',
      amountIn: 1_000_000n,
      amountOutMin: 0n,
      confidence: 0.9,
      gasPriorityScore: 0.9,
      firstSeenAt: 1_000,
    });

    const [prediction] = predictor.recalculate({ now: 2_000 });

    expect(prediction.poolAddress).toBe('curve-1');
    expect(prediction.predictedReserves.reserve0).toBeGreaterThan(1_000_000_000n);
    expect(prediction.predictedReserves.reserve1).toBeLessThan(1_000_000_000_000_000_000_000n);
  });

  it('exposes explicit predicted graph inputs API for graph consumers', () => {
    const predictor = new DemandPredictor({ confidenceThreshold: 0.25, maxPendingAgeMs: 60_000 });

    predictor.upsertBasePool({ chainId: 1, poolAddress: 'pool-v2', dexType: 'uniswap-v2', feeBps: 30, token0: 'A', token1: 'B', reserve0: 1_000_000n, reserve1: 1_000_000n });
    predictor.ingestPendingSwap({ txHash: '0xgraph', chainId: 1, poolAddress: 'pool-v2', dexType: 'uniswap-v2', tokenIn: 'A', tokenOut: 'B', amountIn: 10_000n, amountOutMin: 0n, confidence: 0.9, gasPriorityScore: 0.9, firstSeenAt: 1_000 });
    predictor.recalculate({ now: 2_000 });

    const predictedInputs = predictor.createPredictedGraphInputs(1, [
      { chainId: 1, poolAddress: 'pool-v2', reserve0: 1_000_000n, reserve1: 1_000_000n, edgeId: 'A-B' },
    ]);

    expect(predictedInputs).toEqual([
      expect.objectContaining({ poolAddress: 'pool-v2', edgeId: 'A-B' }),
    ]);
    expect(predictedInputs[0]!.reserve0).toBeGreaterThan(1_000_000n);
  });
});
