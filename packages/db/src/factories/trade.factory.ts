import { FlashLoanProvider, Prisma, TradeStatus } from '@prisma/client';

export const buildTradeFactoryInput = (
  required: Pick<Prisma.TradeUncheckedCreateInput, 'strategyId' | 'userId' | 'chainId'>,
  overrides: Partial<Prisma.TradeUncheckedCreateInput> = {},
): Prisma.TradeUncheckedCreateInput => ({
  strategyId: required.strategyId,
  userId: required.userId,
  chainId: required.chainId,
  status: TradeStatus.DETECTED,
  routePath: [
    {
      pool: '0x1111111111111111111111111111111111111111',
      tokenIn: 'WETH',
      tokenOut: 'USDC',
      dex: 'uniswap_v3',
    },
    {
      pool: '0x2222222222222222222222222222222222222222',
      tokenIn: 'USDC',
      tokenOut: 'WETH',
      dex: 'sushiswap',
    },
  ],
  routeHops: 2,
  flashLoanProvider: FlashLoanProvider.AUTO,
  flashLoanToken: '0x0000000000000000000000000000000000000000',
  flashLoanAmount: new Prisma.Decimal('1000000000000000000'),
  flashLoanFee: new Prisma.Decimal('900000000000000'),
  simulatedProfitUsd: new Prisma.Decimal('12.5000'),
  demandPredictionUsed: false,
  executionTimeMs: 150,
  ...overrides,
});
