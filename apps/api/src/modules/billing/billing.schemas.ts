import { z } from 'zod';

export const checkoutBodySchema = z.object({
  plan: z.enum(['trader_monthly', 'trader_annual', 'executor_monthly', 'executor_annual', 'institutional_monthly', 'institutional_annual']),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
