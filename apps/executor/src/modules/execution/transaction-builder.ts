import { ethers } from 'ethers';

export interface SwapHopStruct {
  dexType: number;
  router: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  sqrtPriceLimitX96: bigint;
}

export interface RouteParamsStruct {
  flashLoanProvider: number;
  flashLoanToken: string;
  flashLoanVault: string;
  flashLoanAmount: bigint;
  minProfit: bigint;
  deadline: number;
  hops: SwapHopStruct[];
}

function normalizeAddress(addr: string): string {
  try {
    return ethers.getAddress(addr);
  } catch {
    return addr;
  }
}

export function encodeRouteParams(params: RouteParamsStruct): Uint8Array {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const hopsEncoded = params.hops.map((hop) => [
    hop.dexType,
    normalizeAddress(hop.router),
    normalizeAddress(hop.tokenIn),
    normalizeAddress(hop.tokenOut),
    hop.amountIn,
    hop.sqrtPriceLimitX96,
  ]);

  const encoded = abiCoder.encode(
    ['uint8', 'address', 'address', 'uint256', 'uint256', 'uint256', '(uint8,address,address,address,uint256,uint256)[]'],
    [
      params.flashLoanProvider,
      normalizeAddress(params.flashLoanToken),
      normalizeAddress(params.flashLoanVault),
      params.flashLoanAmount,
      params.minProfit,
      params.deadline,
      hopsEncoded,
    ]
  );

  return ethers.getBytes(encoded);
}

export function decodeRouteParams(data: Uint8Array): RouteParamsStruct {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const hexString = ethers.hexlify(data);

  const decoded = abiCoder.decode(
    ['uint8', 'address', 'address', 'uint256', 'uint256', 'uint256', '(uint8,address,address,address,uint256,uint256)[]'],
    hexString
  );

  return {
    flashLoanProvider: Number(decoded[0]),
    flashLoanToken: normalizeAddress(decoded[1] as string),
    flashLoanVault: normalizeAddress(decoded[2] as string),
    flashLoanAmount: decoded[3] as bigint,
    minProfit: decoded[4] as bigint,
    deadline: Number(decoded[5]),
    hops: (decoded[6] as any[]).map((hop) => ({
      dexType: Number(hop[0]),
      router: normalizeAddress(hop[1] as string),
      tokenIn: normalizeAddress(hop[2] as string),
      tokenOut: normalizeAddress(hop[3] as string),
      amountIn: hop[4] as bigint,
      sqrtPriceLimitX96: hop[5] as bigint,
    })),
  };
}
