import { ethers } from 'ethers';
import type { IRelayProvider, BundleResult, SubmissionTarget } from './relay-provider';

export class SequencerRelay implements IRelayProvider {
  readonly chainId: number = 42161;
  readonly supportsFlashbots = false;

  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;

  constructor(options: { rpcEndpoint: string; wallet: ethers.Wallet }) {
    this.provider = new ethers.JsonRpcProvider(options.rpcEndpoint);
    this.wallet = options.wallet;
  }

  async simulate(
    _signedTx: string,
    _targetBlock: number,
    _coinbase: string
  ): Promise<{ success: boolean; reason?: string }> {
    return { success: true };
  }

  async submit(_targetBlock: number, signedTx: string): Promise<string> {
    const tx = await this.provider.broadcastTransaction(signedTx);
    return tx.hash;
  }

  async waitForInclusion(
    txHash: string,
    maxBlocks: number = 25
  ): Promise<BundleResult> {
    for (let i = 0; i < maxBlocks; i++) {
      const currentBlock = await this.provider.getBlockNumber();

      try {
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          return {
            success: receipt.status === 1,
            txHash,
            blockNumber: receipt.blockNumber,
            reason: receipt.status === 1 ? undefined : 'onchain_revert',
          };
        }
      } catch {
        // Not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return {
      success: false,
      reason: 'not_included',
      error: `Transaction not included after ${maxBlocks} blocks`,
    };
  }

  async submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>> {
    const txHash = await this.submit(targets[0]?.blockNumber ?? 0, signedTx);
    const results = new Map<number, string>();
    for (const target of targets) {
      results.set(target.blockNumber, txHash);
    }
    return results;
  }
}
