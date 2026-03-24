export const PERIOD_OPTIONS = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

export const CHAIN_OPTIONS = [
  { value: '', label: 'All Chains' },
  { value: '1', label: 'Ethereum' },
  { value: '42161', label: 'Arbitrum' },
  { value: '10', label: 'Optimism' },
  { value: '137', label: 'Polygon' },
];

export const formatGwei = (v: number | null) =>
  v === null ? '—' : `${v.toFixed(2)} gwei`;

export const formatUsd = (v: number | null) =>
  v === null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NULL_TOOLTIP: Record<string, string> = {
  avgBaseFee24h: 'Available after execution is enabled',
  avgPriorityFee24h: 'Available after execution is enabled',
  gasSavedByFlashbotsUsd: 'Available after execution is enabled',
  optimalExecutionHours: 'Requires 7+ days of trade history',
  ourWinRate: 'Available after Phase G aggregation runs',
};
