import { FlashLoanProvider, Prisma } from '@prisma/client';

export const buildStrategyFactoryInput = (
  required: Pick<Prisma.StrategyUncheckedCreateInput, 'userId' | 'chainId'>,
  overrides: Partial<Prisma.StrategyUncheckedCreateInput> = {},
): Prisma.StrategyUncheckedCreateInput => ({
  userId: required.userId,
  name: 'Factory Strategy',
  chainId: required.chainId,
  isActive: false,
  minProfitUsd: new Prisma.Decimal('10.00'),
  maxTradeSizeUsd: new Prisma.Decimal('100000.00'),
  maxHops: 4,
  allowedDexes: ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer'],
  allowedTokens: Prisma.JsonNull,
  blockedTokens: [],
  flashLoanProvider: FlashLoanProvider.AUTO,
  useFlashbots: true,
  maxGasPriceGwei: new Prisma.Decimal('100.00'),
  riskBufferPct: new Prisma.Decimal('0.50'),
  useDemandPrediction: true,
  executionCount: 0,
  totalProfitUsd: new Prisma.Decimal('0.00'),
  ...overrides,
});
