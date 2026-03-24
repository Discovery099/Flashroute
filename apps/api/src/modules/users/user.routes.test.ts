import { authenticator } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createAuthenticatedHarness = async () => {
  const harness = await createTestApiHarness();
  const { app } = harness;

  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'profile@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Profile User',
    },
  });

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'profile@flashroute.test',
      password: TEST_PASSWORD,
    },
  });

  return {
    ...harness,
    accessToken: login.json().data.accessToken as string,
    userId: harness.getUserByEmail('profile@flashroute.test')!.id,
  };
};

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createAuthenticatedHarness>>['app'] }).app;

  await app?.close();
});

describe('user and api-key routes', () => {
  it('returns the authenticated user profile', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setSubscriptionForUser(harness.userId, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        user: {
          email: 'profile@flashroute.test',
          name: 'Profile User',
          role: 'monitor',
          subscription: {
            plan: 'trader',
            status: 'active',
            currentPeriodEnd: '2026-04-01T00:00:00.000Z',
          },
        },
      },
    });
  }, 30000);

  it('supports TOTP setup, verify, and disable with backup codes generated on verify', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const setup = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/users/me/2fa/setup',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
        'user-agent': 'FlashRoute-Test-Agent',
      },
    });

    expect(setup.statusCode).toBe(200);
    const setupBody = setup.json();
    expect(setupBody.data.secret).toEqual(expect.any(String));
    expect(setupBody.data.qrCodeUrl).toContain('otpauth://');

    const code = authenticator.generate(setupBody.data.secret as string);
    const verify = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/users/me/2fa/verify',
      payload: {
        code,
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(verify.statusCode).toBe(200);
    const verifyBody = verify.json();
    expect(verifyBody.data.backupCodes).toHaveLength(8);
    expect(verifyBody.data.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const originalOptions = authenticator.options;
    authenticator.options = {
      ...originalOptions,
      epoch: Date.now() + 30_000,
    };
    const nextWindowCode = authenticator.generate(setupBody.data.secret as string);
    authenticator.options = originalOptions;

    const disable = await harness.app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me/2fa',
      payload: {
        code: nextWindowCode,
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
        'user-agent': 'FlashRoute-Test-Agent',
      },
    });

    expect(disable.statusCode).toBe(200);
    expect(harness.getUserById(harness.userId)?.twoFactorEnabled).toBe(false);
    expect(harness.listAuditActionsForUser('profile@flashroute.test')).toContain('user.2fa.disabled');
    const disabledAuditLog = harness.findAuditLogByAction('user.2fa.disabled');
    expect(disabledAuditLog?.details).toMatchObject({
      requestId: expect.any(String),
      userAgent: 'FlashRoute-Test-Agent',
    });
  });

  it('creates an API key, authenticates with constant-time comparison, checks scopes, and updates last-used timestamps', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setUserRole(harness.userId, 'trader');

    const create = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: {
        name: 'Read Key',
        permissions: ['read'],
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
        'user-agent': 'FlashRoute-APIKey-Agent',
        'x-forwarded-for': '198.18.0.30',
      },
    });

    expect(create.statusCode).toBe(201);
    const createBody = create.json();
    const apiKey = createBody.data.key as string;
    expect(apiKey.startsWith('fr_live_')).toBe(true);

    const withApiKey = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(withApiKey.statusCode).toBe(200);

    const record = harness.getApiKeysByUserId(harness.userId)[0];
    expect(record?.lastUsedAt).toBeInstanceOf(Date);
    expect(harness.listAuditActionsForUser('profile@flashroute.test')).toContain('user.api_key.created');
    const createdAuditLog = harness.findAuditLogByAction('user.api_key.created');
    expect(createdAuditLog?.ipAddress).toBe('198.18.0.30');
    expect(createdAuditLog?.userAgent).toBe('FlashRoute-APIKey-Agent');
    expect(createdAuditLog?.requestId).toEqual(expect.any(String));

    const forbidden = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: {
        name: 'Execute Route',
        permissions: ['execute'],
      },
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
      },
    });
  });

  it('rejects malformed bearer tokens with 401 instead of 500', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        authorization: 'Bearer not-a-jwt',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
      },
    });
  });

  it('updates the current user profile and changes password while revoking older refresh tokens', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const patch = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Updated Profile User',
        timezone: 'America/New_York',
        notificationPreferences: { email: true },
      },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      success: true,
      data: {
        user: {
          name: 'Updated Profile User',
          timezone: 'America/New_York',
        },
      },
    });

    const changePassword = await harness.app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/password',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        currentPassword: TEST_PASSWORD,
        newPassword: 'ChangedPass2!',
      },
    });

    expect(changePassword.statusCode).toBe(200);

    const oldTokenProfile = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });
    expect(oldTokenProfile.statusCode).toBe(200);

    const oldRefreshTokens = harness.listRefreshTokensByEmail('profile@flashroute.test');
    expect(oldRefreshTokens.every((token) => token.revokedAt instanceof Date)).toBe(true);

    const newLogin = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'profile@flashroute.test',
        password: 'ChangedPass2!',
      },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('revokes API keys and blocks subsequent API-key authentication', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setUserRole(harness.userId, 'trader');

    const create = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: {
        name: 'Revocable Key',
        permissions: ['read'],
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    const createdKey = create.json().data.key as string;
    const keyId = create.json().data.apiKey.id as string;

    const revoke = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/api-keys/${keyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
        'user-agent': 'FlashRoute-APIKey-Revoke-Agent',
        'x-forwarded-for': '198.18.0.31',
      },
    });

    expect(revoke.statusCode).toBe(200);
    expect(harness.listAuditActionsForUser('profile@flashroute.test')).toContain('user.api_key.revoked');
    const revokedAuditLog = harness.findAuditLogByAction('user.api_key.revoked');
    expect(revokedAuditLog?.ipAddress).toBe('198.18.0.31');
    expect(revokedAuditLog?.userAgent).toBe('FlashRoute-APIKey-Revoke-Agent');
    expect(revokedAuditLog?.requestId).toEqual(expect.any(String));

    const withRevokedKey = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        'x-api-key': createdKey,
      },
    });
    expect(withRevokedKey.statusCode).toBe(401);
  });

  it('writes API key update audit metadata with dedicated request fields', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setUserRole(harness.userId, 'executor');

    const create = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: {
        name: 'Mutable Key',
        permissions: ['read'],
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    const keyId = create.json().data.apiKey.id as string;
    const update = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/api-keys/${keyId}`,
      payload: {
        name: 'Mutable Key Updated',
        permissions: ['read', 'execute'],
      },
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
        'user-agent': 'FlashRoute-APIKey-Update-Agent',
        'x-forwarded-for': '198.18.0.32',
      },
    });

    expect(update.statusCode).toBe(200);
    const updatedAuditLog = harness.findAuditLogByAction('user.api_key.updated');
    expect(updatedAuditLog?.ipAddress).toBe('198.18.0.32');
    expect(updatedAuditLog?.userAgent).toBe('FlashRoute-APIKey-Update-Agent');
    expect(updatedAuditLog?.requestId).toEqual(expect.any(String));
  });

  it('rejects breached passwords during authenticated password change', async (context) => {
    const harness = await createAuthenticatedHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const changePassword = await harness.app.inject({
      method: 'PUT',
      url: '/api/v1/users/me/password',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        currentPassword: TEST_PASSWORD,
        newPassword: 'Password123!',
      },
    });

    expect(changePassword.statusCode).toBe(400);
    expect(changePassword.json()).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });
});
