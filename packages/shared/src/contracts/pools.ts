export type DexType = 'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer';

export interface PoolTokenInput {
  address: string;
  symbol: string;
  decimals: number;
  rawBalance: bigint;
}

export interface RawPoolState {
  chainId: number;
  poolAddress: string;
  dexType: DexType;
  feeBps: number;
  blockNumber: number;
  timestamp: number;
  tokens: PoolTokenInput[];
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  amplification?: bigint;
  weights?: bigint[];
}

export interface NormalizedPoolToken {
  address: string;
  symbol: string;
  decimals: number;
  rawBalance: string;
  normalizedBalance: string;
  normalizedWeight?: string;
}

export interface NormalizedPoolPair {
  tokenIn: string;
  tokenOut: string;
  spotPrice: string;
  feeBps: number;
}

export interface NormalizedPoolState {
  chainId: number;
  poolAddress: string;
  dexType: DexType;
  feeBps: number;
  blockNumber: number;
  timestamp: number;
  tokens: NormalizedPoolToken[];
  normalizedReserves: string[];
  spotPrices: Record<string, string>;
  directedPairs: NormalizedPoolPair[];
  invariant:
    | { kind: 'constant-product' }
    | { kind: 'concentrated-liquidity'; sqrtPriceX96: string; liquidity: string }
    | { kind: 'stable-swap'; amplification: string }
    | { kind: 'weighted-product'; weights: string[] };
}

export interface PoolUpdatedEvent {
  chainId: number;
  poolAddress: string;
  changedFields: Array<'blockNumber' | 'normalizedReserves' | 'spotPrices' | 'timestamp'>;
}
