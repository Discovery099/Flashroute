export interface SubmissionTarget {
  blockNumber: number;
}

export interface BundleResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  reason?: string;
}

export interface IRelayProvider {
  readonly chainId: number;
  readonly supportsFlashbots: boolean;

  simulate(
    signedTx: string,
    targetBlock: number,
    coinbase: string
  ): Promise<{ success: boolean; reason?: string }>;

  submit(targetBlock: number, signedTx: string): Promise<string>;

  waitForInclusion(
    bundleHash: string,
    maxBlocks: number
  ): Promise<BundleResult>;

  submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>>;
}
