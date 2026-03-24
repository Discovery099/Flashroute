import { applyFeeToRatio, formatRatio, invertRatio, ratioFromDecimalizedAmounts } from './shared';

const BPS_DENOMINATOR = 10_000n;

export interface UniswapV2SpotPriceInput {
  reserve0: bigint;
  reserve1: bigint;
  token0Decimals: number;
  token1Decimals: number;
  feeBps: number;
}

export const getUniswapV2SpotPrices = ({
  reserve0,
  reserve1,
  token0Decimals,
  token1Decimals,
  feeBps,
}: UniswapV2SpotPriceInput): { token0ToToken1: string; token1ToToken0: string } => {
  if (reserve0 <= 0n || reserve1 <= 0n) {
    return { token0ToToken1: '0', token1ToToken0: '0' };
  }

  const forward = applyFeeToRatio(
    ratioFromDecimalizedAmounts(reserve1, reserve0, token0Decimals, token1Decimals),
    feeBps,
  );
  const reverse = applyFeeToRatio(invertRatio(ratioFromDecimalizedAmounts(reserve1, reserve0, token0Decimals, token1Decimals)), feeBps);

  return {
    token0ToToken1: formatRatio(forward),
    token1ToToken0: formatRatio(reverse),
  };
};

export interface UniswapV2AmountOutInput {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
}

export const getUniswapV2AmountOut = ({
  amountIn,
  reserveIn,
  reserveOut,
  feeBps,
}: UniswapV2AmountOutInput): { amountOut: bigint; reserveInAfter: bigint; reserveOutAfter: bigint } => {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) {
    return {
      amountOut: 0n,
      reserveInAfter: reserveIn,
      reserveOutAfter: reserveOut,
    };
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
