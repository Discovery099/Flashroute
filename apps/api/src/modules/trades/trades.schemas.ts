import { z } from 'zod';

export const tradeStatusSchema = z.enum([
  'detected',
  'simulated',
  'submitted_private',
  'submitted_public',
  'included',
  'settled',
  'reverted',
  'failed',
]);

export const listTradesQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  strategyId: z.string().uuid().optional(),
  status: tradeStatusSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minProfitUsd: z.coerce.number().optional(),
  sortBy: z.enum(['createdAt', 'netProfitUsd', 'gasUsed']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const tradeSummaryQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ListTradesQuery = z.infer<typeof listTradesQuerySchema>;
export type TradeSummaryQuery = z.infer<typeof tradeSummaryQuerySchema>;
export type TradeStatus = z.infer<typeof tradeStatusSchema>;
