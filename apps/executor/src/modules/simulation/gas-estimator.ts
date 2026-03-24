export interface GasEstimateInput {
  providerGasOverhead: number;
  hopDexTypes: Array<'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer'>;
  gasBufferMultiplier: number;
}

const GAS_BY_DEX: Record<GasEstimateInput['hopDexTypes'][number], number> = {
  'uniswap-v2': 120_000,
  'uniswap-v3': 150_000,
  curve: 200_000,
  balancer: 130_000,
};

export const estimateGas = ({ providerGasOverhead, hopDexTypes, gasBufferMultiplier }: GasEstimateInput): number => {
  const baseGas = 21_000 + 80_000;
  const swapGas = hopDexTypes.reduce((sum, dexType) => sum + GAS_BY_DEX[dexType], 0);
  return Math.ceil((baseGas + providerGasOverhead + swapGas) * gasBufferMultiplier);
};
