import { ethers } from 'ethers';
import type { IFlashLoanProvider, FlashLoanQuote, Bytes } from '../flash-loan-provider';

const BALANCER_VAULT_BY_CHAIN: Record<number, string> = {
  1: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  42161: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
};

export class BalancerProvider implements IFlashLoanProvider {
  readonly name = 'balancer' as const;
  readonly feeBps = 0;
  readonly gasOverhead = 35000;

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
    const vault = BALANCER_VAULT_BY_CHAIN[chainId];
    if (!vault) throw new Error(`Balancer not supported on chain ${chainId}`);
    return vault;
  }
}
