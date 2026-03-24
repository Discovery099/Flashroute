export const TRADE_STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string; borderClass: string }> = {
  detected:          { label: 'Detected',           bgClass: 'bg-blue-500/10',   textClass: 'text-blue-300',   borderClass: 'border-blue-500/20' },
  simulated:         { label: 'Simulated',          bgClass: 'bg-purple-500/10', textClass: 'text-purple-300', borderClass: 'border-purple-500/20' },
  submitted_private:  { label: 'Private',            bgClass: 'bg-cyan-500/10',   textClass: 'text-cyan-300',   borderClass: 'border-cyan-500/20' },
  submitted_public:   { label: 'Public',            bgClass: 'bg-teal-500/10',   textClass: 'text-teal-300',   borderClass: 'border-teal-500/20' },
  included:          { label: 'Included',           bgClass: 'bg-yellow-500/10', textClass: 'text-yellow-300', borderClass: 'border-yellow-500/20' },
  settled:           { label: 'Settled',            bgClass: 'bg-emerald-500/10',textClass: 'text-emerald-300',borderClass: 'border-emerald-500/20' },
  reverted:          { label: 'Reverted',           bgClass: 'bg-red-500/10',    textClass: 'text-red-300',    borderClass: 'border-red-500/20' },
  failed:            { label: 'Failed',              bgClass: 'bg-rose-500/10',   textClass: 'text-rose-300',   borderClass: 'border-rose-500/20' },
};

export const formatRoutePath = (routePath: Array<{ tokenIn?: string | null; tokenOut?: string | null }>): string =>
  routePath.map((h) => `${h.tokenIn ?? '?'}→${h.tokenOut ?? '?'}`).join(' > ');

export const getExplorerUrl = (chainId: number, txHash: string): string => {
  const baseUrls: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    42161: 'https://arbiscan.io/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    137: 'https://polygonscan.com/tx/',
  };
  return `${baseUrls[chainId] ?? 'https://etherscan.io/tx/'}${txHash}`;
};
