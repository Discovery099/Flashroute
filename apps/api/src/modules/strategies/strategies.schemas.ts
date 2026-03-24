import { z } from 'zod';

export const STRATEGY_DEXES = ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer'] as const;
export const STRATEGY_FLASH_LOAN_PROVIDERS = ['auto', 'aave', 'balancer', 'dydx'] as const;

export const supportedDexesByChainId: Record<number, readonly (typeof STRATEGY_DEXES)[number][]> = {
  1: ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer'],
  42161: ['uniswap_v3', 'sushiswap', 'balancer'],
  10: ['uniswap_v3', 'curve', 'balancer'],
  137: ['uniswap_v3', 'sushiswap', 'curve'],
};

const nameSchema = z.string().trim().min(3, 'Name must be at least 3 characters').max(100, 'Name must be 100 characters or fewer');
const allowedDexesSchema = z.array(z.enum(STRATEGY_DEXES)).min(1, 'Select at least one DEX');

export const createStrategySchema = z.object({
  name: nameSchema,
  chainId: z.coerce.number().int('Chain is required').positive('Chain is required'),
  description: z.string().trim().max(280, 'Description must be 280 characters or fewer').optional().default(''),
  minProfitUsd: z.coerce.number().gt(0, 'Min profit must be greater than 0').optional(),
  maxTradeSizeUsd: z.coerce.number().min(100, 'Max trade size must be at least 100').max(10_000_000, 'Max trade size exceeds the supported limit').optional().default(100_000),
  maxHops: z.coerce.number().int('Max hops must be an integer').min(2, 'Max hops must be at least 2').max(6, 'Max hops must be 6 or fewer').optional(),
  riskBufferPct: z.coerce.number().min(0.01, 'Risk buffer must be at least 0.01').max(5, 'Risk buffer must be 5.0 or lower').optional(),
  maxGasPriceGwei: z.coerce.number().gt(0, 'Max gas price must be greater than 0').optional().default(100),
  maxSlippageBps: z.coerce.number().int('Max slippage must be an integer').min(1, 'Max slippage must be at least 1 bps').max(500, 'Max slippage must be 500 bps or fewer').optional().default(100),
  cooldownSeconds: z.coerce.number().int('Cooldown must be an integer').min(0, 'Cooldown must be 0 or greater').optional().default(0),
  allowedDexes: allowedDexesSchema.optional(),
  flashLoanProvider: z.enum(STRATEGY_FLASH_LOAN_PROVIDERS).optional().default('auto'),
  useFlashbots: z.boolean().optional().default(true),
  useDemandPrediction: z.boolean().optional().default(true),
});

export const updateStrategySchema = createStrategySchema.omit({ chainId: true }).partial().extend({
  chainId: z.never().optional(),
});

export const listStrategiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  chainId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().optional().default(''),
});

export const deleteStrategyQuerySchema = z.object({
  confirm: z.coerce.boolean().optional().default(false),
});

export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>;
export type ListStrategiesQuery = z.infer<typeof listStrategiesQuerySchema>;
