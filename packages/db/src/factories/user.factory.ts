import { randomUUID } from 'node:crypto';

import { Prisma, UserRole } from '@prisma/client';

const DEFAULT_PASSWORD_HASH = '$2b$12$flashrouteflashrouteflashrouteflashrouteflashroute';

export const buildUserFactoryInput = (
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
): Prisma.UserUncheckedCreateInput => ({
  email: `user-${randomUUID()}@flashroute.test`,
  passwordHash: DEFAULT_PASSWORD_HASH,
  name: 'FlashRoute User',
  role: UserRole.MONITOR,
  emailVerified: false,
  timezone: 'UTC',
  loginCount: 0,
  failedLoginCount: 0,
  twoFactorEnabled: false,
  notificationPreferences: {},
  ...overrides,
});
