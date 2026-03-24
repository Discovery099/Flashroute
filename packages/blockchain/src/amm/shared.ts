export interface DecimalizedAmount {
  raw: bigint;
  decimals: number;
}

export interface Ratio {
  numerator: bigint;
  denominator: bigint;
}

export const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent);

export const normalizeAmount = ({ raw, decimals }: DecimalizedAmount): string => {
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  const prefix = negative ? '-' : '';

  if (fractionText.length === 0) {
    return `${prefix}${whole.toString()}`;
  }

  return `${prefix}${whole.toString()}.${fractionText}`;
};

export const trimFixed = (value: string): string => {
  if (value.includes('e') || value.includes('E')) {
    return value;
  }

  if (value.includes('.')) {
    return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  return value;
};

export const createRatio = (numerator: bigint, denominator: bigint): Ratio => {
  if (denominator === 0n) {
    throw new Error('Ratio denominator cannot be zero');
  }

  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }

  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const divisor = gcd(absoluteNumerator, absoluteDenominator);
  const reducedNumerator = absoluteNumerator / divisor;
  const reducedDenominator = absoluteDenominator / divisor;

  return {
    numerator: negative ? -reducedNumerator : reducedNumerator,
    denominator: reducedDenominator,
  };
};

export const multiplyRatio = (left: Ratio, right: Ratio): Ratio =>
  createRatio(left.numerator * right.numerator, left.denominator * right.denominator);

export const divideRatio = (left: Ratio, right: Ratio): Ratio =>
  createRatio(left.numerator * right.denominator, left.denominator * right.numerator);

export const invertRatio = (ratio: Ratio): Ratio => createRatio(ratio.denominator, ratio.numerator);

export const ratioFromDecimalizedAmounts = (
  rawOut: bigint,
  rawIn: bigint,
  tokenInDecimals: number,
  tokenOutDecimals: number,
): Ratio => {
  const numerator = rawOut * pow10(tokenInDecimals);
  const denominator = rawIn * pow10(tokenOutDecimals);
  return createRatio(numerator, denominator);
};

export const decimalizeRawAmount = (raw: bigint, decimals: number, scale = 18): bigint => {
  if (decimals === scale) {
    return raw;
  }

  if (decimals < scale) {
    return raw * pow10(scale - decimals);
  }

  return raw / pow10(decimals - scale);
};

export const applyFeeToRatio = (ratio: Ratio, feeBps: number): Ratio =>
  multiplyRatio(ratio, createRatio(BigInt(10_000 - feeBps), 10_000n));

export const formatRatio = (ratio: Ratio, precision = 12): string => {
  if (ratio.numerator === 0n) {
    return '0';
  }

  const negative = ratio.numerator < 0n;
  const absoluteNumerator = negative ? -ratio.numerator : ratio.numerator;
  const whole = absoluteNumerator / ratio.denominator;
  let remainder = absoluteNumerator % ratio.denominator;
  const digits: string[] = [];

  for (let index = 0; index < precision; index += 1) {
    remainder *= 10n;
    digits.push((remainder / ratio.denominator).toString());
    remainder %= ratio.denominator;
  }

  const prefix = negative ? '-' : '';
  if (digits.length === 0 || digits.every((digit) => digit === '0')) {
    return `${prefix}${whole.toString()}`;
  }

  return trimFixed(`${prefix}${whole.toString()}.${digits.join('')}`);
};

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left;
  let b = right;

  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a;
};
