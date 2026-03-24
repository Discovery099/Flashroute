export const STRATEGY_CHAIN_OPTIONS = [
  { value: 1, label: 'Ethereum' },
  { value: 42161, label: 'Arbitrum' },
  { value: 10, label: 'Optimism' },
  { value: 137, label: 'Polygon' },
] as const;

export const STRATEGY_DEX_OPTIONS = [
  { value: 'uniswap_v2', label: 'Uniswap V2' },
  { value: 'uniswap_v3', label: 'Uniswap V3' },
  { value: 'sushiswap', label: 'Sushiswap' },
  { value: 'curve', label: 'Curve' },
  { value: 'balancer', label: 'Balancer' },
] as const;

export const supportedDexesByChain: Record<number, string[]> = {
  1: ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer'],
  42161: ['uniswap_v3', 'sushiswap', 'balancer'],
  10: ['uniswap_v3', 'curve', 'balancer'],
  137: ['uniswap_v3', 'sushiswap', 'curve'],
};

export const flashLoanProviderOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'aave', label: 'Aave' },
  { value: 'balancer', label: 'Balancer' },
  { value: 'dydx', label: 'dYdX' },
] as const;

export const chainLabel = (chainId: number) => STRATEGY_CHAIN_OPTIONS.find((option) => option.value === chainId)?.label ?? `Chain ${chainId}`;
