import { MempoolMonitor } from './modules/mempool/mempool-monitor';
import { resolvePoolImpactsFromDecodedSwap, type DecodedSwapTransaction, type PendingTransactionInput } from './modules/mempool/tx-decoder';
import { DemandPredictor } from './modules/prediction/demand-predictor';

export const createMempoolWorker = (input?: {
  now?: () => number;
  currentBaseFeePerGas?: bigint;
  confidenceThreshold?: number;
  maxPendingAgeMs?: number;
  poolResolver?: Parameters<typeof resolvePoolImpactsFromDecodedSwap>[1]['resolvePool'];
}) => {
  const now = input?.now ?? (() => Date.now());
  const maxPendingAgeMs = input?.maxPendingAgeMs ?? 60_000;
  const monitor = new MempoolMonitor({
    currentBaseFeePerGas: input?.currentBaseFeePerGas ?? 1n,
    now,
    maxPendingAgeMs,
  });
  const predictor = new DemandPredictor({
    confidenceThreshold: input?.confidenceThreshold ?? 0.25,
    maxPendingAgeMs,
  });

  const handleDecodedSwap = (decoded: DecodedSwapTransaction, chainId: number) => {
    monitor.addDecodedSwap(decoded);

    if (input?.poolResolver) {
      predictor.ingestPendingSwaps(resolvePoolImpactsFromDecodedSwap(decoded, {
        chainId,
        resolvePool: input.poolResolver,
      }));
    }
  };

  const handlePendingTransaction = (tx: PendingTransactionInput, chainId: number) => {
    const decoded = monitor.processPendingTransaction(tx);
    if (decoded && input?.poolResolver) {
      predictor.ingestPendingSwaps(resolvePoolImpactsFromDecodedSwap(decoded, {
        chainId,
        resolvePool: input.poolResolver,
      }));
    }
    return decoded;
  };

  const runPredictionCycle = () => predictor.recalculate({ now: now() });

  const reconcileConfirmedTransactions = (txHashes: string[]) => {
    monitor.removeConfirmedTransactions(txHashes);
    predictor.removeConfirmedTransactions(txHashes);
  };

  return {
    monitor,
    predictor,
    handleDecodedSwap,
    handlePendingTransaction,
    runPredictionCycle,
    reconcileConfirmedTransactions,
  };
};
