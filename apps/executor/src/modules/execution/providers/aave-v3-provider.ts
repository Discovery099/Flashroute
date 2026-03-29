import { ethers } from 'ethers';
import type { IFlashLoanProvider, FlashLoanQuote, Bytes } from '../flash-loan-provider';

const AAVE_V3_POOL_BY_CHAIN: Record<number, string> = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

export class AaveV3Provider implements IFlashLoanProvider {
  readonly name = 'aave-v3' as const;
  readonly feeBps = 5;
  readonly gasOverhead = 40000;

  async getQuote(token: string, amount: bigint): Promise<FlashLoanQuote> {
    const estimatedCost = (amount * BigInt(this.feeBps)) / 10_000n;
    return {
      provider: this.name,
      feeBps: this.feeBps,
      estimatedCost,
    };
  }

  async buildCalldata(token: string, amount: bigint): Promise<Bytes> {
    return ethers.toUtf8Bytes('') as Bytes;
  }

  getVaultAddress(chainId: number): string {
    return this.getPoolAddress(chainId);
  }

  getPoolAddress(chainId: number): string {
    const pool = AAVE_V3_POOL_BY_CHAIN[chainId];
    if (!pool) throw new Error(`Aave V3 not supported on chain ${chainId}`);
    return pool;
  }
}
