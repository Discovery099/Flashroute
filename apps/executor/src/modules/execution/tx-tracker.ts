import type { ethers } from 'ethers';

export interface TxReceiptResult {
  success: boolean;
  txHash: string;
  blockNumber?: number;
  gasUsed?: bigint;
  gasPriceGwei?: number;
  reason?: string;
}

export class TxTracker {
  constructor(private readonly provider: ethers.JsonRpcProvider) {}

  async waitForReceipt(txHash: string, maxBlocks: number = 25): Promise<TxReceiptResult> {
    const startBlock = await this.provider.getBlockNumber();

    while (true) {
      const currentBlock = await this.provider.getBlockNumber();

      if (currentBlock - startBlock > maxBlocks) {
        return {
          success: false,
          txHash,
          reason: 'not_included',
        };
      }

      try {
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          if (receipt.status === 1) {
            return {
              success: true,
              txHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed,
              gasPriceGwei: Number(receipt.gasPrice) / 1e9,
            };
          } else {
            return {
              success: false,
              txHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed,
              gasPriceGwei: Number(receipt.gasPrice) / 1e9,
              reason: 'onchain_revert',
            };
          }
        }
      } catch {
        // Receipt not ready yet
      }

      const chainId = (await this.provider.getNetwork()).chainId;
      const delay = chainId === 1n ? 12000 : 250;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
