import { DemandPredictor, type PendingPoolSwap, type PredictedDexType } from '../prediction/demand-predictor';

export interface PendingTransactionInput {
  hash: string;
  from: string;
  to: string;
  data: string;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  value?: bigint;
  nonce: number;
  firstSeenAt: number;
}

export interface DecodedSwapHop {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMin: bigint;
  fee?: number;
}

export interface DecodedSwapTransaction {
  txHash: string;
  dex: 'uniswap_v2' | 'uniswap_v3' | 'universal_router' | 'curve' | 'balancer' | 'aggregator';
  method: string;
  amountSpecified: bigint;
  swaps: DecodedSwapHop[];
  sender: string;
  gasPrice: bigint;
  confidence: number;
  firstSeenAt: number;
}

const SELECTORS = {
  swapExactTokensForTokens: '0x38ed1739',
  swapExactETHForTokens: '0x7ff36ab5',
  swapExactTokensForETH: '0x18cbafe5',
  swapTokensForExactTokens: '0x8803dbee',
  multicallWithoutDeadline: '0xac9650d8',
  multicallWithDeadline: '0x5ae401dc',
  exactInputSingle: '0x04e45aaf',
  exactInput: '0xb858183f',
  exactOutputSingle: '0x5023b4df',
  exactOutput: '0x09b81346',
  universalExecute: '0x3593564c',
  curveExchange: '0xa6417ed6',
  curveExchangeUnderlying: '0x394747c5',
  balancerSwap: '0x52bbbe29',
  balancerBatchSwap: '0x945bcec9',
  sellToUniswap: '0xd9627aa4',
  swapETHForExactTokens: '0xfb3bdb41',
} as const;

const readWord = (data: string, wordIndex: number): string => data.slice(10 + wordIndex * 64, 10 + (wordIndex + 1) * 64);
const readUint = (word: string): bigint => BigInt(`0x${word}`);
const readAddress = (word: string): string => `0x${word.slice(24).toLowerCase()}`;

const getConfidence = (tx: PendingTransactionInput, context: { now: number; currentBaseFeePerGas: bigint }) => {
  const predictor = new DemandPredictor({ confidenceThreshold: 0, maxPendingAgeMs: 60_000 });
  return predictor.calculateConfidenceScore({
    gasPrice: tx.gasPrice ?? 0n,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    firstSeenAt: tx.firstSeenAt,
    now: context.now,
    currentBaseFeePerGas: context.currentBaseFeePerGas,
  });
};

const readAddressArray = (data: string, offsetBytes: bigint): string[] => {
  const start = 10 + Number(offsetBytes) * 2;
  const length = Number(readUint(data.slice(start, start + 64)));
  const result: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const wordStart = start + 64 + index * 64;
    result.push(readAddress(data.slice(wordStart, wordStart + 64)));
  }

  return result;
};

const readBytesArray = (data: string, offsetBytes: bigint): string[] => {
  const start = 10 + Number(offsetBytes) * 2;
  const length = Number(readUint(data.slice(start, start + 64)));
  const result: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const relativeOffset = Number(readUint(data.slice(start + 64 + index * 64, start + 64 + (index + 1) * 64)));
    const itemStart = start + relativeOffset * 2;
    const itemLength = Number(readUint(data.slice(itemStart, itemStart + 64)));
    result.push(`0x${data.slice(itemStart + 64, itemStart + 64 + itemLength * 2)}`);
  }

  return result;
};

const decodeV2ByPath = (
  tx: PendingTransactionInput,
  context: { now: number; currentBaseFeePerGas: bigint },
  params: { method: string; amountSpecified: bigint; amountOutMin: bigint; pathOffsetWordIndex: number },
): DecodedSwapTransaction => {
  const path = readAddressArray(tx.data, readUint(readWord(tx.data, params.pathOffsetWordIndex)));

  return {
    txHash: tx.hash,
    dex: 'uniswap_v2',
    method: params.method,
    amountSpecified: params.amountSpecified,
    swaps: [{ tokenIn: path[0]!, tokenOut: path[path.length - 1]!, amountIn: params.amountSpecified, amountOutMin: params.amountOutMin }],
    sender: tx.from,
    gasPrice: tx.gasPrice ?? 0n,
    confidence: getConfidence(tx, context),
    firstSeenAt: tx.firstSeenAt,
  };
};

const decodeExactInputSingle = (callData: string): DecodedSwapHop => ({
  tokenIn: readAddress(callData.slice(10, 74)),
  tokenOut: readAddress(callData.slice(74, 138)),
  fee: Number(readUint(callData.slice(138, 202))),
  amountIn: readUint(callData.slice(330, 394)),
  amountOutMin: readUint(callData.slice(394, 458)),
});

const decodeExactOutputSingle = (callData: string): DecodedSwapHop => ({
  tokenIn: readAddress(callData.slice(10, 74)),
  tokenOut: readAddress(callData.slice(74, 138)),
  fee: Number(readUint(callData.slice(138, 202))),
  amountIn: readUint(callData.slice(394, 458)),
  amountOutMin: readUint(callData.slice(330, 394)),
});

const decodeExactOutput = (callData: string): DecodedSwapHop[] => {
  const pathOffset = Number(readUint(callData.slice(10, 74)));
  const amountOut = readUint(callData.slice(202, 266));
  const amountInMaximum = readUint(callData.slice(266, 330));
  const bodyStart = 10 + pathOffset * 2;
  const pathLength = Number(readUint(callData.slice(bodyStart, bodyStart + 64)));
  const path = `0x${callData.slice(bodyStart + 64, bodyStart + 64 + pathLength * 2)}`;
  const decodedPath = decodeV3Path(path).reverse();

  return decodedPath.map((hop, index) => ({
    tokenIn: hop.tokenOut,
    tokenOut: hop.tokenIn,
    fee: hop.fee,
    amountIn: index === 0 ? amountInMaximum : 0n,
    amountOutMin: amountOut,
  }));
};

const decodeV3Path = (pathData: string): Array<{ tokenIn: string; tokenOut: string; fee: number }> => {
  const bytes = pathData.replace(/^0x/, '').toLowerCase();
  const hops: Array<{ tokenIn: string; tokenOut: string; fee: number }> = [];
  let cursor = 0;
  let currentToken = `0x${bytes.slice(cursor, cursor + 40)}`;
  cursor += 40;

  while (cursor < bytes.length) {
    const fee = Number.parseInt(bytes.slice(cursor, cursor + 6), 16);
    cursor += 6;
    const nextToken = `0x${bytes.slice(cursor, cursor + 40)}`;
    cursor += 40;
    hops.push({ tokenIn: currentToken, tokenOut: nextToken, fee });
    currentToken = nextToken;
  }

  return hops;
};

const decodeExactInput = (callData: string): DecodedSwapHop[] => {
  const pathOffset = Number(readUint(callData.slice(10, 74)));
  const amountIn = readUint(callData.slice(202, 266));
  const amountOutMin = readUint(callData.slice(266, 330));
  const bodyStart = 10 + pathOffset * 2;
  const pathLength = Number(readUint(callData.slice(bodyStart, bodyStart + 64)));
  const path = `0x${callData.slice(bodyStart + 64, bodyStart + 64 + pathLength * 2)}`;

  return decodeV3Path(path).map((hop, index) => ({
    tokenIn: hop.tokenIn,
    tokenOut: hop.tokenOut,
    fee: hop.fee,
    amountIn: index === 0 ? amountIn : 0n,
    amountOutMin,
  }));
};

const decodeV3Multicall = (tx: PendingTransactionInput, context: { now: number; currentBaseFeePerGas: bigint }, bytesOffsetWordIndex: number): DecodedSwapTransaction | null => {
  const calls = readBytesArray(tx.data, readUint(readWord(tx.data, bytesOffsetWordIndex)));
  const swaps: DecodedSwapHop[] = [];

  for (const call of calls) {
    const selector = call.slice(0, 10).toLowerCase();
    if (selector === SELECTORS.exactInputSingle) {
      swaps.push(decodeExactInputSingle(call));
    }
    if (selector === SELECTORS.exactInput) {
      swaps.push(...decodeExactInput(call));
    }
    if (selector === SELECTORS.exactOutputSingle) {
      swaps.push(decodeExactOutputSingle(call));
    }
    if (selector === SELECTORS.exactOutput) {
      swaps.push(...decodeExactOutput(call));
    }
  }

  if (swaps.length === 0) {
    return null;
  }

  return {
    txHash: tx.hash,
    dex: 'uniswap_v3',
    method: 'multicall',
    amountSpecified: swaps[0]!.amountIn,
    swaps,
    sender: tx.from,
    gasPrice: tx.gasPrice ?? 0n,
    confidence: getConfidence(tx, context),
    firstSeenAt: tx.firstSeenAt,
  };
};

export const decodePendingSwapTransaction = (tx: PendingTransactionInput, context: { now: number; currentBaseFeePerGas: bigint }): DecodedSwapTransaction | null => {
  const selector = tx.data.slice(0, 10).toLowerCase();

  if (selector === SELECTORS.swapExactTokensForTokens) {
    return decodeV2ByPath(tx, context, {
      method: 'swapExactTokensForTokens',
      amountSpecified: readUint(readWord(tx.data, 0)),
      amountOutMin: readUint(readWord(tx.data, 1)),
      pathOffsetWordIndex: 2,
    });
  }

  if (selector === SELECTORS.swapExactETHForTokens) {
    return decodeV2ByPath(tx, context, {
      method: 'swapExactETHForTokens',
      amountSpecified: tx.value ?? 0n,
      amountOutMin: readUint(readWord(tx.data, 0)),
      pathOffsetWordIndex: 1,
    });
  }

  if (selector === SELECTORS.swapExactTokensForETH) {
    return decodeV2ByPath(tx, context, {
      method: 'swapExactTokensForETH',
      amountSpecified: readUint(readWord(tx.data, 0)),
      amountOutMin: readUint(readWord(tx.data, 1)),
      pathOffsetWordIndex: 2,
    });
  }

  if (selector === SELECTORS.swapTokensForExactTokens) {
    return decodeV2ByPath(tx, context, {
      method: 'swapTokensForExactTokens',
      amountSpecified: readUint(readWord(tx.data, 1)),
      amountOutMin: readUint(readWord(tx.data, 0)),
      pathOffsetWordIndex: 2,
    });
  }

  if (selector === SELECTORS.swapETHForExactTokens) {
    return decodeV2ByPath(tx, context, {
      method: 'swapETHForExactTokens',
      amountSpecified: tx.value ?? 0n,
      amountOutMin: readUint(readWord(tx.data, 0)),
      pathOffsetWordIndex: 1,
    });
  }

  if (selector === SELECTORS.multicallWithoutDeadline) {
    return decodeV3Multicall(tx, context, 0);
  }

  if (selector === SELECTORS.multicallWithDeadline) {
    return decodeV3Multicall(tx, context, 1);
  }

  if (selector === SELECTORS.universalExecute) {
    const bytesOffset = readUint(readWord(tx.data, 1));
    const calls = readBytesArray(tx.data, bytesOffset);
    const swaps = calls.flatMap((call) => {
      const innerSelector = call.slice(0, 10).toLowerCase();
      if (innerSelector === SELECTORS.exactInputSingle) return [decodeExactInputSingle(call)];
      if (innerSelector === SELECTORS.exactInput) return decodeExactInput(call);
      if (innerSelector === SELECTORS.exactOutputSingle) return [decodeExactOutputSingle(call)];
      return [];
    });
    return {
      txHash: tx.hash,
      dex: 'universal_router',
      method: 'execute',
      amountSpecified: swaps[0]?.amountIn ?? 0n,
      swaps,
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.9,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  if (selector === SELECTORS.curveExchange) {
    return {
      txHash: tx.hash,
      dex: 'curve',
      method: 'exchange',
      amountSpecified: readUint(readWord(tx.data, 2)),
      swaps: [{
        tokenIn: `index:${readUint(readWord(tx.data, 0)).toString()}`,
        tokenOut: `index:${readUint(readWord(tx.data, 1)).toString()}`,
        amountIn: readUint(readWord(tx.data, 2)),
        amountOutMin: readUint(readWord(tx.data, 3)),
      }],
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.85,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  if (selector === SELECTORS.curveExchangeUnderlying) {
    return {
      txHash: tx.hash,
      dex: 'curve',
      method: 'exchange_underlying',
      amountSpecified: readUint(readWord(tx.data, 2)),
      swaps: [{
        tokenIn: `index:${readUint(readWord(tx.data, 0)).toString()}`,
        tokenOut: `index:${readUint(readWord(tx.data, 1)).toString()}`,
        amountIn: readUint(readWord(tx.data, 2)),
        amountOutMin: readUint(readWord(tx.data, 3)),
      }],
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.85,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  if (selector === SELECTORS.balancerSwap) {
    return {
      txHash: tx.hash,
      dex: 'balancer',
      method: 'swap',
      amountSpecified: readUint(readWord(tx.data, 2)),
      swaps: [{
        tokenIn: readAddress(tx.data.slice(330, 394)),
        tokenOut: readAddress(tx.data.slice(394, 458)),
        amountIn: readUint(readWord(tx.data, 2)),
        amountOutMin: 0n,
      }],
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.85,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  if (selector === SELECTORS.balancerBatchSwap) {
    return {
      txHash: tx.hash,
      dex: 'balancer',
      method: 'batchSwap',
      amountSpecified: readUint(readWord(tx.data, 0 + 12)),
      swaps: [{
        tokenIn: readAddress(tx.data.slice(906, 970)),
        tokenOut: readAddress(tx.data.slice(970, 1034)),
        amountIn: 0n,
        amountOutMin: 0n,
      }],
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.85,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  if (selector === SELECTORS.sellToUniswap) {
    return {
      txHash: tx.hash,
      dex: 'aggregator',
      method: 'sellToUniswap',
      amountSpecified: 0n,
      swaps: [],
      sender: tx.from,
      gasPrice: tx.gasPrice ?? 0n,
      confidence: getConfidence(tx, context) * 0.5,
      firstSeenAt: tx.firstSeenAt,
    };
  }

  return null;
};

export const resolvePoolImpactsFromDecodedSwap = (
  decoded: DecodedSwapTransaction,
  input: {
    chainId: number;
    resolvePool: (hop: { tokenIn: string; tokenOut: string; dex: 'uniswap-v2' | 'uniswap-v3'; fee?: number }) => { poolAddress: string; dexType: PredictedDexType } | null;
  },
): PendingPoolSwap[] => decoded.swaps.flatMap((swap) => {
  const resolved = input.resolvePool({
    tokenIn: swap.tokenIn,
    tokenOut: swap.tokenOut,
    dex: decoded.dex === 'uniswap_v2' ? 'uniswap-v2' : 'uniswap-v3',
    fee: swap.fee,
  });

  if (!resolved) {
    return [];
  }

  return [{
    txHash: decoded.txHash,
    chainId: input.chainId,
    poolAddress: resolved.poolAddress,
    dexType: resolved.dexType,
    tokenIn: swap.tokenIn,
    tokenOut: swap.tokenOut,
    amountIn: swap.amountIn,
    amountOutMin: swap.amountOutMin,
    confidence: decoded.confidence,
    gasPriorityScore: Number(decoded.gasPrice),
    firstSeenAt: decoded.firstSeenAt,
  }];
});
