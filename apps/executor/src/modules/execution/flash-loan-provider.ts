export type Bytes = Uint8Array;

export interface FlashLoanQuote {
  provider: string;
  feeBps: number;
  estimatedCost: bigint;
}

export interface IFlashLoanProvider {
  readonly name: 'balancer' | 'aave-v3';
  readonly feeBps: number;
  readonly gasOverhead: number;

  getQuote(token: string, amount: bigint): Promise<FlashLoanQuote>;
  buildCalldata(token: string, amount: bigint): Promise<Bytes>;
  getVaultAddress(chainId: number): string;
}
