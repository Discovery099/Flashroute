import { applyFeeToRatio, createRatio, formatRatio, invertRatio } from './shared';

const BPS_DENOMINATOR = 10_000;

export interface BalancerSpotPriceInput {
  balances: bigint[];
  tokenDecimals: number[];
  weights: bigint[];
  feeBps: number;
  tokenInIndex: number;
  tokenOutIndex: number;
}

export const normalizeWeights = (weights: bigint[]): string[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0n);
  if (total === 0n) {
    return weights.map(() => '0');
  }

  return weights.map((weight) => formatRatio(createRatio(weight, total)));
};

export const getBalancerSpotPrices = ({
  balances,
  tokenDecimals,
  weights,
  feeBps,
  tokenInIndex,
  tokenOutIndex,
}: BalancerSpotPriceInput): { token0ToToken1: string; token1ToToken0: string } => {
  const inputBalance = balances[tokenInIndex] ?? 0n;
  const outputBalance = balances[tokenOutIndex] ?? 0n;
  const inputWeight = weights[tokenInIndex] ?? 0n;
  const outputWeight = weights[tokenOutIndex] ?? 0n;
  const inputDecimals = tokenDecimals[tokenInIndex] ?? 0;
  const outputDecimals = tokenDecimals[tokenOutIndex] ?? 0;

  if (inputBalance <= 0n || outputBalance <= 0n || inputWeight <= 0n || outputWeight <= 0n) {
    return { token0ToToken1: '0', token1ToToken0: '0' };
  }

  const base = createRatio(
    outputBalance * inputWeight * (10n ** BigInt(inputDecimals)),
    inputBalance * outputWeight * (10n ** BigInt(outputDecimals)),
  );
  const forward = applyFeeToRatio(base, feeBps);
  const reverse = applyFeeToRatio(invertRatio(base), feeBps);

  return {
    token0ToToken1: formatRatio(forward),
    token1ToToken0: formatRatio(reverse),
  };
};

export interface BalancerAmountOutInput {
  amountIn: bigint;
  balances: bigint[];
  weights: bigint[];
  feeBps: number;
  tokenInIndex: number;
  tokenOutIndex: number;
}

export const getBalancerAmountOut = ({
  amountIn,
  balances,
  weights,
  feeBps,
  tokenInIndex,
  tokenOutIndex,
}: BalancerAmountOutInput): { amountOut: bigint; newBalances: bigint[] } => {
  if (amountIn <= 0n) {
    return { amountOut: 0n, newBalances: [...balances] };
  }

  const balanceIn = Number(balances[tokenInIndex] ?? 0n);
  const balanceOut = Number(balances[tokenOutIndex] ?? 0n);
  const weightIn = Number(weights[tokenInIndex] ?? 0n);
  const weightOut = Number(weights[tokenOutIndex] ?? 0n);

  if (balanceIn <= 0 || balanceOut <= 0 || weightIn <= 0 || weightOut <= 0) {
    return { amountOut: 0n, newBalances: [...balances] };
  }

  const amountInAfterFee = Number(amountIn) * (BPS_DENOMINATOR - feeBps) / BPS_DENOMINATOR;
  const base = balanceIn / (balanceIn + amountInAfterFee);
  const exponent = weightIn / weightOut;
  const amountOut = BigInt(Math.floor(balanceOut * (1 - (base ** exponent))));
  const newBalances = [...balances];

  newBalances[tokenInIndex] = (newBalances[tokenInIndex] ?? 0n) + amountIn;
  newBalances[tokenOutIndex] = (newBalances[tokenOutIndex] ?? 0n) - amountOut;

  return { amountOut, newBalances };
};
