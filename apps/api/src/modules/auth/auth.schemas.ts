import { z } from 'zod';

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$/;
const timezoneRegex = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/;

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128).regex(strongPassword, 'Password must meet complexity requirements'),
  name: z.string().trim().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  totpCode: z.string().trim().length(6).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = refreshSchema;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128).regex(strongPassword, 'Password must meet complexity requirements'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().trim().regex(timezoneRegex, 'Timezone must be a valid IANA timezone').optional(),
    notificationPreferences: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128).regex(strongPassword, 'Password must meet complexity requirements'),
});

export const setupTwoFactorVerifySchema = z.object({
  code: z.string().trim().length(6),
});

export const disableTwoFactorSchema = z.object({
  code: z.string().trim().min(6).max(9),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.enum(['read', 'execute', 'admin'])).min(1).default(['read']),
  expiresAt: z.string().datetime().optional(),
});

export const updateApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    permissions: z.array(z.enum(['read', 'execute', 'admin'])).min(1).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
