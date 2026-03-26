import { z } from 'zod';

export const alertTypeSchema = z.enum(['opportunity_found', 'trade_executed', 'trade_failed', 'profit_threshold', 'gas_spike', 'system_error']);

export const alertChannelSchema = z.enum(['dashboard', 'email', 'telegram', 'webhook']);

const telegramChatIdSchema = z.string().regex(/^-?\d+$/, 'Telegram chat ID must be numeric');

const webhookUrlSchema = z.string().url('Must be a valid URL');

export const createAlertSchema = z.object({
  type: alertTypeSchema,
  chainId: z.number().int().positive().optional(),
  strategyId: z.string().uuid().optional(),
  thresholdValue: z.number().positive('Threshold must be positive').optional(),
  deliveryChannel: alertChannelSchema,
  deliveryConfig: z.record(z.unknown()).default(() => ({})),
  cooldownSeconds: z.number().int().min(10, 'Cooldown minimum is 10 seconds').default(60),
}).refine(
  (data) => {
    if (data.deliveryChannel === 'telegram') {
      const config = data.deliveryConfig as Record<string, unknown>;
      return typeof config.chatId === 'string' && telegramChatIdSchema.safeParse(config.chatId).success;
    }
    return true;
  },
  {
    message: 'Telegram delivery requires a valid chatId in deliveryConfig',
    path: ['deliveryConfig'],
  },
).refine(
  (data) => {
    if (data.deliveryChannel === 'webhook') {
      const config = data.deliveryConfig as Record<string, unknown>;
      return typeof config.url === 'string' && webhookUrlSchema.safeParse(config.url).success;
    }
    return true;
  },
  {
    message: 'Webhook delivery requires a valid url in deliveryConfig',
    path: ['deliveryConfig'],
  },
);

export const updateAlertSchema = z.object({
  type: alertTypeSchema.optional(),
  chainId: z.number().int().positive().optional(),
  strategyId: z.string().uuid().nullable().optional(),
  thresholdValue: z.number().positive('Threshold must be positive').nullable().optional(),
  deliveryChannel: alertChannelSchema.optional(),
  deliveryConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(10, 'Cooldown minimum is 10 seconds').optional(),
}).refine(
  (data) => {
    if (data.deliveryChannel === 'telegram' && data.deliveryConfig) {
      const config = data.deliveryConfig as Record<string, unknown>;
      return typeof config.chatId === 'string' && telegramChatIdSchema.safeParse(config.chatId).success;
    }
    return true;
  },
  {
    message: 'Telegram delivery requires a valid chatId in deliveryConfig',
    path: ['deliveryConfig'],
  },
).refine(
  (data) => {
    if (data.deliveryChannel === 'webhook' && data.deliveryConfig) {
      const config = data.deliveryConfig as Record<string, unknown>;
      return typeof config.url === 'string' && webhookUrlSchema.safeParse(config.url).success;
    }
    return true;
  },
  {
    message: 'Webhook delivery requires a valid url in deliveryConfig',
    path: ['deliveryConfig'],
  },
);

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: alertTypeSchema.optional(),
  isActive: z.coerce.boolean().default(true),
});

export const alertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AlertType = z.infer<typeof alertTypeSchema>;
export type AlertChannel = z.infer<typeof alertChannelSchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;
