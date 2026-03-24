import { applyFeeToRatio, createRatio, decimalizeRawAmount, formatRatio, invertRatio, pow10 } from './shared';

const CURVE_PRECISION = 10n ** 18n;
const BPS_DENOMINATOR = 10_000n;

export interface CurveSpotPriceInput {
  balances: bigint[];
  tokenDecimals: number[];
  amplification: bigint;
  feeBps: number;
  tokenInIndex: number;
  tokenOutIndex: number;
}

export const getCurveSpotPrice = ({
  balances,
  tokenDecimals,
  amplification,
  feeBps,
  tokenInIndex,
  tokenOutIndex,
}: CurveSpotPriceInput): { token0ToToken1: string; token1ToToken0: string } => {
  const scaledBalances = balances.map((balance, index) => decimalizeRawAmount(balance, tokenDecimals[index] ?? 0));
  const inputBalance = scaledBalances[tokenInIndex] ?? 0n;
  const outputBalance = scaledBalances[tokenOutIndex] ?? 0n;

  if (inputBalance <= 0n || outputBalance <= 0n) {
    return { token0ToToken1: '0', token1ToToken0: '0' };
  }

  const averageLiquidity = scaledBalances.reduce((sum, balance) => sum + balance, 0n) / BigInt(Math.max(scaledBalances.length, 1));
  const amplificationWeight = amplification * BigInt(Math.max(scaledBalances.length, 1)) * pow10(18);
  const parityAdjusted = createRatio(
    outputBalance * averageLiquidity + inputBalance * amplificationWeight,
    inputBalance * (averageLiquidity + amplificationWeight),
  );
  const forward = applyFeeToRatio(parityAdjusted, feeBps);
  const reverse = applyFeeToRatio(invertRatio(parityAdjusted), feeBps);

  return {
    token0ToToken1: formatRatio(forward),
    token1ToToken0: formatRatio(reverse),
  };
};

export interface CurveAmountOutInput {
  amountIn: bigint;
  tokenInIndex: number;
  tokenOutIndex: number;
  balances: bigint[];
  decimals: number[];
  amplification: bigint;
  feeBps: number;
}

const scaleToPrecision = (amount: bigint, decimals: number): bigint => {
  if (decimals === 18) {
    return amount;
  }

  if (decimals < 18) {
    return amount * pow10(18 - decimals);
  }

  return amount / pow10(decimals - 18);
};

const scaleFromPrecision = (amount: bigint, decimals: number): bigint => {
  if (decimals === 18) {
    return amount;
  }

  if (decimals < 18) {
    return amount / pow10(18 - decimals);
  }

  return amount * pow10(decimals - 18);
};

const getInvariant = (balances: bigint[], amplification: bigint): bigint => {
  const tokenCount = balances.length;
  const total = balances.reduce((sum, balance) => sum + balance, 0n);

  if (total === 0n) {
    return 0n;
  }

  let invariant = total;
  const n = BigInt(tokenCount);
  const ann = amplification * n;

  for (let i = 0; i < 255; i += 1) {
    let dP = invariant;

    for (const balance of balances) {
      dP = (dP * invariant) / (balance * n);
    }

    const previous = invariant;
    invariant = ((ann * total + dP * n) * invariant) / ((ann - 1n) * invariant + (n + 1n) * dP);

    if (invariant > previous ? invariant - previous <= 1n : previous - invariant <= 1n) {
      return invariant;
    }
  }

  throw new Error('Curve invariant did not converge');
};

const getY = (
  tokenInIndex: number,
  tokenOutIndex: number,
  x: bigint,
  balances: bigint[],
  amplification: bigint,
  invariant: bigint,
): bigint => {
  const tokenCount = balances.length;
  const n = BigInt(tokenCount);
  const ann = amplification * n;
  let c = invariant;
  let sum = 0n;

  for (let index = 0; index < tokenCount; index += 1) {
    let balance = balances[index]!;

    if (index === tokenInIndex) {
      balance = x;
    }

    if (index === tokenOutIndex) {
      continue;
    }

    sum += balance;
    c = (c * invariant) / (balance * n);
  }

  c = (c * invariant) / (ann * n);
  const b = sum + invariant / ann;
  let y = invariant;

  for (let i = 0; i < 255; i += 1) {
    const previous = y;
    y = (y * y + c) / (2n * y + b - invariant);

    if (y > previous ? y - previous <= 1n : previous - y <= 1n) {
      return y;
    }
  }

  throw new Error('Curve getY did not converge');
};

export const getCurveAmountOut = ({
  amountIn,
  tokenInIndex,
  tokenOutIndex,
  balances,
  decimals,
  amplification,
  feeBps,
}: CurveAmountOutInput): { amountOut: bigint; newBalances: bigint[] } => {
  if (amountIn <= 0n) {
    return { amountOut: 0n, newBalances: [...balances] };
  }

  const scaledBalances = balances.map((balance, index) => scaleToPrecision(balance, decimals[index] ?? 18));
  const scaledAmountIn = scaleToPrecision(amountIn, decimals[tokenInIndex] ?? 18);
  const invariant = getInvariant(scaledBalances, amplification);
  const x = scaledBalances[tokenInIndex]! + scaledAmountIn;
  const y = getY(tokenInIndex, tokenOutIndex, x, scaledBalances, amplification, invariant);
  const grossAmountOut = scaledBalances[tokenOutIndex]! - y;
  const fee = (grossAmountOut * BigInt(feeBps)) / BPS_DENOMINATOR;
  const amountOutScaled = grossAmountOut - fee;
  const amountOut = scaleFromPrecision(amountOutScaled, decimals[tokenOutIndex] ?? 18);
  const newBalances = [...balances];

  newBalances[tokenInIndex] = balances[tokenInIndex]! + amountIn;
  newBalances[tokenOutIndex] = balances[tokenOutIndex]! - amountOut;

  return {
    amountOut,
    newBalances,
  };
};
