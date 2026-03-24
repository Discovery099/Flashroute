import { z } from 'zod';

export const PERIOD_VALUES = ['7d', '30d', '90d', 'all'] as const;
export type Period = typeof PERIOD_VALUES[number];
export const analyticsPeriodSchema = z.enum(PERIOD_VALUES).default('7d');

export const baseAnalyticsQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  period: analyticsPeriodSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsOverviewQuerySchema = baseAnalyticsQuerySchema.extend({
  period: analyticsPeriodSchema.default('7d'),
});

export const analyticsRoutesQuerySchema = baseAnalyticsQuerySchema.extend({
  strategyId: z.string().uuid().optional(),
});

export const analyticsCompetitorsQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsGasQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  period: analyticsPeriodSchema.default('7d'),
});

export type BaseAnalyticsQuery = z.infer<typeof baseAnalyticsQuerySchema>;
export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;
export type AnalyticsRoutesQuery = z.infer<typeof analyticsRoutesQuerySchema>;
export type AnalyticsCompetitorsQuery = z.infer<typeof analyticsCompetitorsQuerySchema>;
export type AnalyticsGasQuery = z.infer<typeof analyticsGasQuerySchema>;
