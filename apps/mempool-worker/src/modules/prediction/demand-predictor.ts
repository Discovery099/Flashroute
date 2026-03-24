import { getBalancerAmountOut, getCurveAmountOut, getUniswapV2AmountOut, getUniswapV3AmountOut } from '@flashroute/blockchain';

export type PredictedDexType = 'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer';

export interface BasePoolState {
  chainId: number;
  poolAddress: string;
  dexType: PredictedDexType;
  feeBps: number;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  weights?: bigint[];
  amplification?: bigint;
  tokens?: string[];
  tokenDecimals?: number[];
}

export interface PendingPoolSwap {
  txHash: string;
  chainId: number;
  poolAddress: string;
  dexType: PredictedDexType;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMin: bigint;
  confidence: number;
  gasPriorityScore: number;
  firstSeenAt: number;
}

export interface DemandPrediction {
  poolAddress: string;
  chainId: number;
  dexType: PredictedDexType;
  currentReserves: { reserve0: bigint; reserve1: bigint };
  predictedReserves: { reserve0: bigint; reserve1: bigint };
  pendingSwapCount: number;
  confidence: number;
  contributingTxs: string[];
  predictedAt: number;
}

const getPoolKey = (chainId: number, poolAddress: string) => `${chainId}:${poolAddress.toLowerCase()}`;

export class DemandPredictor {
  private readonly basePools = new Map<string, BasePoolState>();
  private readonly pendingSwaps = new Map<string, PendingPoolSwap>();
  private readonly overlays = new Map<string, DemandPrediction>();

  constructor(private readonly config: { confidenceThreshold: number; maxPendingAgeMs: number }) {}

  upsertBasePool(pool: BasePoolState): void {
    this.basePools.set(getPoolKey(pool.chainId, pool.poolAddress), { ...pool });
  }

  getBasePool(poolAddress: string, chainId = 1): BasePoolState | undefined {
    return this.basePools.get(getPoolKey(chainId, poolAddress));
  }

  getOverlayPool(chainIdOrPoolAddress: number | string, poolAddress?: string): DemandPrediction | undefined {
    if (typeof chainIdOrPoolAddress === 'string') {
      return this.overlays.get(getPoolKey(1, chainIdOrPoolAddress));
    }

    return this.overlays.get(getPoolKey(chainIdOrPoolAddress, poolAddress!));
  }

  getActivePredictions(chainId: number): DemandPrediction[] {
    return [...this.overlays.values()]
      .filter((prediction) => prediction.chainId === chainId)
      .sort((left, right) => right.confidence - left.confidence);
  }

  applyPredictionsToPools<T extends { chainId: number; poolAddress: string; reserve0: bigint; reserve1: bigint }>(chainId: number, pools: T[]): T[] {
    return pools.map((pool) => {
      if (pool.chainId !== chainId) {
        return pool;
      }

      const overlay = this.getOverlayPool(pool.chainId, pool.poolAddress);
      if (!overlay) {
        return pool;
      }

      return {
        ...pool,
        reserve0: overlay.predictedReserves.reserve0,
        reserve1: overlay.predictedReserves.reserve1,
      };
    });
  }

  applyPredictionsToGraphInputs<T extends { chainId: number; poolAddress: string; reserve0: bigint; reserve1: bigint }>(chainId: number, inputs: T[]): T[] {
    return this.applyPredictionsToPools(chainId, inputs);
  }

  createPredictedGraphInputs<T extends { chainId: number; poolAddress: string; reserve0: bigint; reserve1: bigint }>(chainId: number, inputs: T[]): T[] {
    return this.applyPredictionsToGraphInputs(chainId, inputs);
  }

  ingestPendingSwap(swap: PendingPoolSwap): void {
    this.pendingSwaps.set(swap.txHash, swap);
  }

  ingestPendingSwaps(swaps: PendingPoolSwap[]): void {
    for (const swap of swaps) {
      this.ingestPendingSwap(swap);
    }
  }

  removeConfirmedTransactions(txHashes: string[]): void {
    for (const txHash of txHashes) {
      this.pendingSwaps.delete(txHash);
    }

    for (const [poolKey, overlay] of this.overlays.entries()) {
      if (overlay.contributingTxs.some((txHash) => txHashes.includes(txHash))) {
        this.overlays.delete(poolKey);
      }
    }
  }

  calculateConfidenceScore(input: {
    gasPrice: bigint;
    maxPriorityFeePerGas?: bigint;
    firstSeenAt: number;
    now: number;
    currentBaseFeePerGas: bigint;
  }): number {
    const priorityFee = input.maxPriorityFeePerGas ?? (input.gasPrice > input.currentBaseFeePerGas
      ? input.gasPrice - input.currentBaseFeePerGas
      : 0n);
    const gasFactor = Math.min(1, Number(priorityFee) / Math.max(Number(input.currentBaseFeePerGas) * 0.25, 1));
    const ageMs = Math.max(0, input.now - input.firstSeenAt);
    const freshnessFactor = Math.max(0, 1 - ageMs / this.config.maxPendingAgeMs);
    return Math.max(0, Math.min(1, gasFactor * 0.8 + freshnessFactor * 0.2));
  }

  recalculate({ now }: { now: number }): DemandPrediction[] {
    this.overlays.clear();
    const workingPools = new Map<string, BasePoolState>();

    for (const [poolKey, pool] of this.basePools.entries()) {
      workingPools.set(poolKey, { ...pool });
    }

    const grouped = new Map<string, PendingPoolSwap[]>();

    for (const [txHash, swap] of this.pendingSwaps.entries()) {
      if (now - swap.firstSeenAt >= this.config.maxPendingAgeMs) {
        this.pendingSwaps.delete(txHash);
        continue;
      }

      if (swap.confidence < this.config.confidenceThreshold) {
        continue;
      }

      const poolKey = getPoolKey(swap.chainId, swap.poolAddress);
      const list = grouped.get(poolKey) ?? [];
      list.push(swap);
      grouped.set(poolKey, list);
    }

    for (const [poolKey, swaps] of grouped.entries()) {
      const basePool = this.basePools.get(poolKey);
      const workingPool = workingPools.get(poolKey);
      if (!basePool || !workingPool) {
        continue;
      }

      swaps.sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }
        return right.gasPriorityScore - left.gasPriorityScore;
      });

      const contributingTxs: string[] = [];
      let confidenceTotal = 0;

      for (const swap of swaps) {
        const directionIsToken0 = swap.tokenIn === workingPool.token0 && swap.tokenOut === workingPool.token1;
        const directionIsToken1 = swap.tokenIn === workingPool.token1 && swap.tokenOut === workingPool.token0;
        if (!directionIsToken0 && !directionIsToken1) {
          continue;
        }

        const reserveIn = directionIsToken0 ? workingPool.reserve0 : workingPool.reserve1;
        const reserveOut = directionIsToken0 ? workingPool.reserve1 : workingPool.reserve0;
        const simulated = workingPool.dexType === 'uniswap-v2'
          ? getUniswapV2AmountOut({ amountIn: swap.amountIn, reserveIn, reserveOut, feeBps: workingPool.feeBps })
          : workingPool.dexType === 'uniswap-v3'
            ? getUniswapV3AmountOut({
              amountIn: swap.amountIn,
              reserveIn,
              reserveOut,
              feeBps: workingPool.feeBps,
              sqrtPriceX96: workingPool.sqrtPriceX96 ?? 0n,
              liquidity: workingPool.liquidity ?? 0n,
            })
            : workingPool.dexType === 'curve'
              ? getCurveAmountOut({
                amountIn: swap.amountIn,
                tokenInIndex: directionIsToken0 ? 0 : 1,
                tokenOutIndex: directionIsToken0 ? 1 : 0,
                balances: [workingPool.reserve0, workingPool.reserve1],
                decimals: workingPool.tokenDecimals ?? [18, 18],
                amplification: workingPool.amplification ?? 1n,
                feeBps: workingPool.feeBps,
              })
            : getBalancerAmountOut({
              amountIn: swap.amountIn,
              balances: directionIsToken0 ? [workingPool.reserve0, workingPool.reserve1] : [workingPool.reserve1, workingPool.reserve0],
              weights: workingPool.weights ?? [500_000n, 500_000n],
              feeBps: workingPool.feeBps,
              tokenInIndex: 0,
              tokenOutIndex: 1,
            });

        if (directionIsToken0) {
          if ('reserveInAfter' in simulated) {
            workingPool.reserve0 = simulated.reserveInAfter;
            workingPool.reserve1 = simulated.reserveOutAfter;
          } else {
            workingPool.reserve0 = simulated.newBalances[0]!;
            workingPool.reserve1 = simulated.newBalances[1]!;
          }
        } else {
          if ('reserveInAfter' in simulated) {
            workingPool.reserve1 = simulated.reserveInAfter;
            workingPool.reserve0 = simulated.reserveOutAfter;
          } else {
            workingPool.reserve1 = simulated.newBalances[0]!;
            workingPool.reserve0 = simulated.newBalances[1]!;
          }
        }

        contributingTxs.push(swap.txHash);
        confidenceTotal += swap.confidence;
      }

      if (contributingTxs.length === 0) {
        continue;
      }

      this.overlays.set(poolKey, {
        poolAddress: basePool.poolAddress,
        chainId: basePool.chainId,
        dexType: basePool.dexType,
        currentReserves: { reserve0: basePool.reserve0, reserve1: basePool.reserve1 },
        predictedReserves: { reserve0: workingPool.reserve0, reserve1: workingPool.reserve1 },
        pendingSwapCount: contributingTxs.length,
        confidence: confidenceTotal / contributingTxs.length,
        contributingTxs,
        predictedAt: now,
      });
    }

    return [...this.overlays.values()];
  }
}
