import { decodePendingSwapTransaction, type DecodedSwapTransaction, type PendingTransactionInput } from './tx-decoder';

export class MempoolMonitor {
  private readonly pending = new Map<string, DecodedSwapTransaction>();

  constructor(private readonly context: { currentBaseFeePerGas: bigint; now: () => number; maxPendingAgeMs: number }) {}

  processPendingTransaction(tx: PendingTransactionInput): DecodedSwapTransaction | null {
    const decoded = decodePendingSwapTransaction(tx, {
      now: this.context.now(),
      currentBaseFeePerGas: this.context.currentBaseFeePerGas,
    });

    if (decoded) {
      this.addDecodedSwap(decoded);
    }

    return decoded;
  }

  addDecodedSwap(decoded: DecodedSwapTransaction): void {
    this.pending.set(decoded.txHash, decoded);
  }

  getActivePendingSwaps(): DecodedSwapTransaction[] {
    const now = this.context.now();

    for (const [txHash, decoded] of this.pending.entries()) {
      if (now - decoded.firstSeenAt > this.context.maxPendingAgeMs) {
        this.pending.delete(txHash);
      }
    }

    return [...this.pending.values()].sort((left, right) => right.confidence - left.confidence);
  }

  removePendingTx(txHash: string): void {
    this.pending.delete(txHash);
  }

  removeConfirmedTransactions(txHashes: string[]): void {
    for (const txHash of txHashes) {
      this.pending.delete(txHash);
    }
  }
}
