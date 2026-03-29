import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import type { FlashbotsBundleRawTransaction } from '@flashbots/ethers-provider-bundle';
import { ethers } from 'ethers';
import type { IRelayProvider, BundleResult, SubmissionTarget } from './relay-provider';

export class FlashbotsRelay implements IRelayProvider {
  readonly chainId: number;
  readonly supportsFlashbots = true;

  private provider: ethers.JsonRpcProvider;
  private flashbotsProvider!: FlashbotsBundleProvider;
  private relayUrl: string;

  constructor(options: { rpcEndpoint: string; relayUrl?: string }) {
    this.provider = new ethers.JsonRpcProvider(options.rpcEndpoint);
    this.relayUrl = options.relayUrl ?? 'https://relay.flashbots.net';
    this.chainId = 1;
  }

  async initialize(signer: ethers.Signer): Promise<void> {
    this.flashbotsProvider = await FlashbotsBundleProvider.create(
      this.provider,
      signer,
      this.relayUrl
    );
  }

  async simulate(
    signedTx: string,
    targetBlock: number,
    _coinbase: string
  ): Promise<{ success: boolean; reason?: string }> {
    const bundle: Array<string> = [signedTx];

    try {
      const simulation = await this.flashbotsProvider.simulate(bundle, targetBlock + 1);

      if ('error' in simulation) {
        return { success: false, reason: simulation.error.message };
      }

      for (const result of simulation.results) {
        if ('error' in result) {
          return { success: false, reason: result.error };
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, reason: String(err) };
    }
  }

  async submit(targetBlock: number, signedTx: string): Promise<string> {
    const bundle: FlashbotsBundleRawTransaction[] = [{ signedTransaction: signedTx }];
    const response = await this.flashbotsProvider.sendBundle(bundle, targetBlock);

    if ('error' in response) {
      throw new Error(`Flashbots submission failed: ${response.error.message}`);
    }

    return response.bundleHash;
  }

  async waitForInclusion(
    bundleHash: string,
    maxBlocks: number = 3
  ): Promise<BundleResult> {
    for (let i = 0; i < maxBlocks; i++) {
      const currentBlock = await this.provider.getBlockNumber();

      try {
        const stats = await this.flashbotsProvider.getBundleStatsV2(bundleHash, currentBlock);

        if (!('error' in stats) && (stats.isHighPriority || stats.simulatedAt)) {
          const receipts = await this.flashbotsProvider.sendRawBundle([bundleHash], currentBlock);
          if (!('error' in receipts)) {
            const receiptList = await receipts.receipts();
            for (const receipt of receiptList) {
              if (receipt.status === 1 && receipt.hash) {
                return {
                  success: true,
                  txHash: receipt.hash,
                  blockNumber: receipt.blockNumber ?? currentBlock,
                };
              }
            }
          }
        }
      } catch {
        // Poll again
      }

      await new Promise((resolve) => setTimeout(resolve, 12000));
    }

    return {
      success: false,
      reason: 'not_included',
      error: `Bundle not included after ${maxBlocks} blocks`,
    };
  }

  async submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>> {
    const results = new Map<number, string>();
    for (const target of targets) {
      const bundleHash = await this.submit(target.blockNumber, signedTx);
      results.set(target.blockNumber, bundleHash);
    }
    return results;
  }
}
