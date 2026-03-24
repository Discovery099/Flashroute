import { getBalancerAmountOut, getCurveAmountOut, getUniswapV2AmountOut, getUniswapV3AmountOut } from '@flashroute/blockchain';

import { estimateGas } from './gas-estimator';

type DexType = 'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer';

interface V2PoolState {
  dexType: 'uniswap-v2';
  feeBps: number;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
}

interface CurvePoolState {
  dexType: 'curve';
  feeBps: number;
  amplification: bigint;
  tokens: string[];
  balances: bigint[];
  decimals: number[];
}

interface V3PoolState {
  dexType: 'uniswap-v3';
  feeBps: number;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
}

interface BalancerPoolState {
  dexType: 'balancer';
  feeBps: number;
  tokens: string[];
  balances: bigint[];
  weights: bigint[];
}

type PoolState = V2PoolState | V3PoolState | CurvePoolState | BalancerPoolState;

interface RouteHop {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  dexType: DexType;
}

interface FlashLoanProvider {
  name: string;
  feeBps: number;
  gasOverhead: number;
}

interface SimulationRoute {
  sourceToken: string;
  usdPerSourceToken: number;
  flashLoanProviders: FlashLoanProvider[];
  pools: Record<string, PoolState>;
  predictedPools?: Partial<Record<string, PoolState>>;
  path: RouteHop[];
}

interface SimulationOptions {
  amountIn: bigint;
  gasPriceWei: bigint;
  ethUsdPrice: number;
  congestionLevel: number;
}

type HopSnapshot = { reserve0: bigint; reserve1: bigint } | { balances: bigint[] };

export class ProfitSimulator {
  constructor(
    private readonly config: { nativeTokenUsdPrice: number; riskBufferBaseBps: number; congestionRiskBps: number; gasBufferMultiplier: number },
  ) {}

  simulate(route: SimulationRoute, options: SimulationOptions) {
    const provider = this.selectFlashLoanProvider(route, options);
    const pools = this.clonePools(route.pools, route.predictedPools);
    let currentAmount = options.amountIn;

    const hops = route.path.map((hop) => {
      const pool = pools.get(hop.poolAddress);
      if (!pool) {
        throw new Error(`Missing pool ${hop.poolAddress}`);
      }

      const amountIn = currentAmount;

      if (pool.dexType === 'uniswap-v2') {
        const snapshot = { reserve0: pool.reserve0, reserve1: pool.reserve1 };
        const forward = hop.tokenIn === pool.token0 && hop.tokenOut === pool.token1;
        const simulated = getUniswapV2AmountOut({
          amountIn,
          reserveIn: forward ? pool.reserve0 : pool.reserve1,
          reserveOut: forward ? pool.reserve1 : pool.reserve0,
          feeBps: pool.feeBps,
        });
        if (forward) {
          pool.reserve0 = simulated.reserveInAfter;
          pool.reserve1 = simulated.reserveOutAfter;
        } else {
          pool.reserve1 = simulated.reserveInAfter;
          pool.reserve0 = simulated.reserveOutAfter;
        }

        currentAmount = simulated.amountOut;
        return {
          poolAddress: hop.poolAddress,
          amountIn,
          amountOut: simulated.amountOut,
          slippagePct: amountIn === 0n ? 0 : Math.max(0, (1 - Number(simulated.amountOut) / Number(amountIn)) * 100),
          poolSnapshotBefore: snapshot satisfies HopSnapshot,
        };
      }

      if (pool.dexType === 'uniswap-v3') {
        const snapshot = { reserve0: pool.reserve0, reserve1: pool.reserve1 };
        const forward = hop.tokenIn === pool.token0 && hop.tokenOut === pool.token1;
        const simulated = getUniswapV3AmountOut({
          amountIn,
          reserveIn: forward ? pool.reserve0 : pool.reserve1,
          reserveOut: forward ? pool.reserve1 : pool.reserve0,
          feeBps: pool.feeBps,
          sqrtPriceX96: pool.sqrtPriceX96,
          liquidity: pool.liquidity,
        });

        if (forward) {
          pool.reserve0 = simulated.reserveInAfter;
          pool.reserve1 = simulated.reserveOutAfter;
        } else {
          pool.reserve1 = simulated.reserveInAfter;
          pool.reserve0 = simulated.reserveOutAfter;
        }

        currentAmount = simulated.amountOut;
        return {
          poolAddress: hop.poolAddress,
          amountIn,
          amountOut: simulated.amountOut,
          slippagePct: amountIn === 0n ? 0 : Math.max(0, (1 - Number(simulated.amountOut) / Number(amountIn)) * 100),
          poolSnapshotBefore: snapshot satisfies HopSnapshot,
        };
      }

      if (pool.dexType === 'curve') {
        const tokenInIndex = pool.tokens.indexOf(hop.tokenIn);
        const tokenOutIndex = pool.tokens.indexOf(hop.tokenOut);
        const snapshot = { balances: [...pool.balances] };
        const simulated = getCurveAmountOut({
          amountIn,
          tokenInIndex,
          tokenOutIndex,
          balances: pool.balances,
          decimals: pool.decimals,
          amplification: pool.amplification,
          feeBps: pool.feeBps,
        });

        pool.balances = simulated.newBalances;
        currentAmount = simulated.amountOut;
        return {
          poolAddress: hop.poolAddress,
          amountIn,
          amountOut: simulated.amountOut,
          slippagePct: 0,
          poolSnapshotBefore: snapshot satisfies HopSnapshot,
        };
      }

      const tokenInIndex = pool.tokens.indexOf(hop.tokenIn);
      const tokenOutIndex = pool.tokens.indexOf(hop.tokenOut);
      const snapshot = { balances: [...pool.balances] };
      const simulated = getBalancerAmountOut({
        amountIn,
        balances: pool.balances,
        weights: pool.weights,
        feeBps: pool.feeBps,
        tokenInIndex,
        tokenOutIndex,
      });

      pool.balances = simulated.newBalances;
      currentAmount = simulated.amountOut;
      return {
        poolAddress: hop.poolAddress,
        amountIn,
        amountOut: simulated.amountOut,
        slippagePct: amountIn === 0n ? 0 : Math.max(0, (1 - Number(simulated.amountOut) / Number(amountIn)) * 100),
        poolSnapshotBefore: snapshot satisfies HopSnapshot,
      };
    });

    const gasUsed = estimateGas({
      providerGasOverhead: provider.gasOverhead,
      hopDexTypes: route.path.map((hop) => hop.dexType),
      gasBufferMultiplier: this.config.gasBufferMultiplier,
    });
    const flashLoanFee = (options.amountIn * BigInt(provider.feeBps)) / 10_000n;
    const gasCostUsd = (Number(options.gasPriceWei) * gasUsed * options.ethUsdPrice) / 1e18;
    const grossOutput = currentAmount;
    const grossProfitTokens = grossOutput - options.amountIn;
    const flashLoanFeeUsd = Number(flashLoanFee) * route.usdPerSourceToken;
    const grossProfitUsd = Number(grossProfitTokens) * route.usdPerSourceToken;
    const riskBufferUsd = (Number(options.amountIn) * route.usdPerSourceToken * (this.config.riskBufferBaseBps + this.config.congestionRiskBps * options.congestionLevel)) / 10_000;
    const netProfitUsd = grossProfitUsd - flashLoanFeeUsd - gasCostUsd;

    return {
      provider,
      hops,
      totalGas: gasUsed,
      grossOutput,
      flashLoanFee,
      gasCostUsd,
      grossProfitUsd,
      slippagePct: hops.reduce((sum, hop) => sum + hop.slippagePct, 0),
      riskBufferUsd,
      netProfitUsd,
      profitable: netProfitUsd > riskBufferUsd,
    };
  }

  searchOptimalInput(route: SimulationRoute, options: { minAmountIn: bigint; maxAmountIn: bigint; tolerance: bigint; gasPriceWei: bigint; ethUsdPrice: number; congestionLevel: number }) {
    let lo = options.minAmountIn;
    let hi = options.maxAmountIn;

    while (hi - lo > options.tolerance) {
      const m1 = lo + (hi - lo) / 3n;
      const m2 = hi - (hi - lo) / 3n;
      const p1 = this.simulate(route, { amountIn: m1, gasPriceWei: options.gasPriceWei, ethUsdPrice: options.ethUsdPrice, congestionLevel: options.congestionLevel }).netProfitUsd;
      const p2 = this.simulate(route, { amountIn: m2, gasPriceWei: options.gasPriceWei, ethUsdPrice: options.ethUsdPrice, congestionLevel: options.congestionLevel }).netProfitUsd;
      if (p1 < p2) {
        lo = m1;
      } else {
        hi = m2;
      }
    }

    const amountIn = (lo + hi) / 2n;
    const simulation = this.simulate(route, {
      amountIn,
      gasPriceWei: options.gasPriceWei,
      ethUsdPrice: options.ethUsdPrice,
      congestionLevel: options.congestionLevel,
    });
    return { amountIn, netProfitUsd: simulation.netProfitUsd, simulation };
  }

  private clonePools(basePools: Record<string, PoolState>, predictedPools?: Partial<Record<string, PoolState>>): Map<string, PoolState> {
    const pools = new Map<string, PoolState>();

    for (const [poolAddress, basePool] of Object.entries(basePools)) {
      const pool = predictedPools?.[poolAddress] ?? basePool;
      if (pool.dexType === 'uniswap-v2' || pool.dexType === 'uniswap-v3') {
        pools.set(poolAddress, { ...pool });
      } else if (pool.dexType === 'curve') {
        pools.set(poolAddress, { ...pool, balances: [...pool.balances] });
      } else {
        pools.set(poolAddress, { ...pool, balances: [...pool.balances], weights: [...pool.weights] });
      }
    }

    return pools;
  }

  private selectFlashLoanProvider(route: SimulationRoute, options: SimulationOptions): FlashLoanProvider {
    return [...route.flashLoanProviders].sort((left, right) => {
      const leftCost = this.getProviderCostUsd(left, route, options);
      const rightCost = this.getProviderCostUsd(right, route, options);
      return leftCost - rightCost;
    })[0]!;
  }

  private getProviderCostUsd(provider: FlashLoanProvider, route: SimulationRoute, options: SimulationOptions): number {
    const flashLoanFeeUsd = Number((options.amountIn * BigInt(provider.feeBps)) / 10_000n) * route.usdPerSourceToken;
    const gasUsed = estimateGas({
      providerGasOverhead: provider.gasOverhead,
      hopDexTypes: route.path.map((hop) => hop.dexType),
      gasBufferMultiplier: this.config.gasBufferMultiplier,
    });
    const gasCostUsd = (Number(options.gasPriceWei) * gasUsed * options.ethUsdPrice) / 1e18;
    return flashLoanFeeUsd + gasCostUsd;
  }
}

export type { SimulationRoute };
