export interface ExecutionConfig {
  enabled: boolean;
  privateKey: string;
  chains: number[];
  stalenessThresholdMs: number;
  gasReserveEth: number;
  maxPendingPerChain: number;
  flashbotsRelayUrl: string;
}

export function loadExecutionConfig(): ExecutionConfig {
  const enabled = process.env.EXECUTION_ENABLED === 'true';
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY ?? '';

  if (enabled && !privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY is required when EXECUTION_ENABLED=true');
  }

  return {
    enabled,
    privateKey,
    chains: (process.env.EXECUTOR_CHAINS ?? '1,42161')
      .split(',')
      .map((s) => parseInt(s.trim(), 10)),
    stalenessThresholdMs: parseInt(process.env.EXECUTOR_STALENESS_THRESHOLD_MS ?? '6000', 10),
    gasReserveEth: parseFloat(process.env.EXECUTOR_GAS_RESERVE_ETH ?? '0.05'),
    maxPendingPerChain: parseInt(process.env.EXECUTOR_MAX_PENDING_PER_CHAIN ?? '1', 10),
    flashbotsRelayUrl: process.env.FLASHBOTS_RELAY_URL ?? 'https://relay.flashbots.net',
  };
}
