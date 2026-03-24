import { createRatio, formatRatio, invertRatio, pow10 } from './shared';

const Q96 = 2n ** 96n;
const BPS_DENOMINATOR = 10_000n;

export interface UniswapV3SpotPriceInput {
  sqrtPriceX96: bigint;
  token0Decimals: number;
  token1Decimals: number;
}

export const getUniswapV3SpotPrice = ({
  sqrtPriceX96,
  token0Decimals,
  token1Decimals,
}: UniswapV3SpotPriceInput): { token0ToToken1: string; token1ToToken0: string } => {
  if (sqrtPriceX96 <= 0n) {
    return { token0ToToken1: '0', token1ToToken0: '0' };
  }

  const squaredPrice = sqrtPriceX96 * sqrtPriceX96;
  const decimalFactor = token0Decimals >= token1Decimals
    ? createRatio(pow10(token0Decimals - token1Decimals), 1n)
    : createRatio(1n, pow10(token1Decimals - token0Decimals));
  const forward = createRatio(squaredPrice * decimalFactor.numerator, (Q96 * Q96) * decimalFactor.denominator);
  const reverse = invertRatio(forward);

  return {
    token0ToToken1: formatRatio(forward),
    token1ToToken0: formatRatio(reverse),
  };
};

export interface UniswapV3AmountOutInput {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
}

export const getUniswapV3AmountOut = ({
  amountIn,
  reserveIn,
  reserveOut,
  feeBps,
}: UniswapV3AmountOutInput): { amountOut: bigint; reserveInAfter: bigint; reserveOutAfter: bigint } => {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return { amountOut: 0n, reserveInAfter: reserveIn, reserveOutAfter: reserveOut };
  }

  const amountInWithFee = amountIn * (BPS_DENOMINATOR - BigInt(feeBps));
  const numerator = reserveOut * amountInWithFee;
  const denominator = reserveIn * BPS_DENOMINATOR + amountInWithFee;
  const amountOut = denominator === 0n ? 0n : numerator / denominator;

  return {
    amountOut,
    reserveInAfter: reserveIn + amountIn,
    reserveOutAfter: reserveOut - amountOut,
  };
};
