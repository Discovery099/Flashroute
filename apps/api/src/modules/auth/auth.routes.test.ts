import { authenticator } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createHarness = createTestApiHarness;

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createHarness>>['app'] }).app;

  await app?.close();
});

describe('auth routes', () => {
  it('registers an unverified user, hashes the password, queues verification, and returns tokens', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'Trader@FlashRoute.test ',
        password: TEST_PASSWORD,
        name: 'Route Trader',
      },
      headers: {
        'x-forwarded-for': '203.0.113.10',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(body.data.user).toMatchObject({
      email: 'trader@flashroute.test',
      emailVerified: false,
      role: 'monitor',
    });

    const user = harness.getUserByEmail('trader@flashroute.test');
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(user?.emailVerified).toBe(false);
    const jobs = await harness.getQueuedEmailJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      type: 'send-verification',
      email: 'trader@flashroute.test',
    });

    const auditActions = harness.listAuditActionsForUser('trader@flashroute.test');
    expect(auditActions).toContain('user.register');
    expect(auditActions).toContain('user.email_verification.sent');
  }, 30000);

  it('logs in with valid credentials and rotates refresh tokens', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'rotate@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Rotate Test',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'rotate@flashroute.test',
        password: TEST_PASSWORD,
      },
      headers: {
        'x-forwarded-for': '198.51.100.20',
      },
    });

    expect(login.statusCode).toBe(200);
    const loginBody = login.json();
    expect(loginBody.data.refreshToken).toEqual(expect.any(String));

    const refresh = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: loginBody.data.refreshToken,
      },
      headers: {
        'x-forwarded-for': '198.51.100.20',
      },
    });

    expect(refresh.statusCode).toBe(200);
    const refreshBody = refresh.json();
    expect(refreshBody.data.refreshToken).not.toBe(loginBody.data.refreshToken);

    const family = harness.listRefreshTokensByEmail('rotate@flashroute.test');
    expect(family).toHaveLength(2);
    expect(family[0]?.revokedAt).toBeInstanceOf(Date);
    expect(family[0]?.replacedById).toBe(family[1]?.id);
    expect(family[1]?.revokedAt).toBeNull();
  });

  it('writes a logout audit event with request metadata', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'logout@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Logout User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'logout@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const logout = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
        'user-agent': 'FlashRoute-Logout-Agent',
        'x-forwarded-for': '198.18.0.20',
      },
      payload: {
        refreshToken: login.json().data.refreshToken,
      },
    });

    expect(logout.statusCode).toBe(200);
    const auditLog = harness.findAuditLogByAction('user.logout');
    expect(auditLog).toBeDefined();
    expect(auditLog?.ipAddress).toBe('198.18.0.20');
    expect(auditLog?.userAgent).toBe('FlashRoute-Logout-Agent');
    expect(auditLog?.requestId).toEqual(expect.any(String));
  });

  it('revokes the entire refresh family when a revoked token is reused', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'reuse@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Reuse Test',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'reuse@flashroute.test',
        password: TEST_PASSWORD,
      },
    });
    const originalRefreshToken = login.json().data.refreshToken as string;

    const firstRefresh = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: originalRefreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);

    const reused = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: originalRefreshToken },
    });

    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token reuse detected. All sessions revoked.',
      },
    });

    const family = harness.listRefreshTokensByEmail('reuse@flashroute.test');
    expect(family).toHaveLength(2);
    expect(family.every((token) => token.revokedAt instanceof Date)).toBe(true);
  });

  it('locks the account after five failed password attempts', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'locked@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Locked User',
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'locked@flashroute.test',
          password: 'WrongPass1!',
        },
        headers: {
          'x-forwarded-for': '192.0.2.50',
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const lockedLogin = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'locked@flashroute.test',
        password: TEST_PASSWORD,
      },
      headers: {
        'x-forwarded-for': '192.0.2.50',
      },
    });

    expect(lockedLogin.statusCode).toBe(401);
    expect(lockedLogin.json().error.message).toContain('Account locked until');
    expect(harness.getUserByEmail('locked@flashroute.test')?.lockedUntil).toBeInstanceOf(Date);

    const auditActions = harness.listAuditActionsForUser('locked@flashroute.test');
    expect(auditActions.filter((action) => action === 'user.login.failed')).toHaveLength(5);
    expect(auditActions).toContain('user.account.locked');
  });

  it('rate limits login requests per IP before credentials are processed', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: `unknown-${attempt}@flashroute.test`,
          password: TEST_PASSWORD,
        },
        headers: {
          'x-forwarded-for': '192.0.2.99',
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const limited = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'someone@flashroute.test',
        password: TEST_PASSWORD,
      },
      headers: {
        'x-forwarded-for': '192.0.2.99',
      },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMITED',
      },
    });
  });

  it('requires a valid TOTP code when 2FA is enabled', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'totp@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Totp User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'totp@flashroute.test',
        password: TEST_PASSWORD,
      },
    });
    const accessToken = login.json().data.accessToken as string;

    const setup = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/users/me/2fa/setup',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    const secret = setup.json().data.secret as string;
    const enable = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/users/me/2fa/verify',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        code: authenticator.generate(secret),
      },
    });
    expect(enable.statusCode).toBe(200);

    const missingCode = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'totp@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    expect(missingCode.statusCode).toBe(401);
    expect(missingCode.json()).toMatchObject({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        details: {
          requiresTwoFactor: true,
        },
      },
    });

    const originalOptions = authenticator.options;
    authenticator.options = {
      ...originalOptions,
      epoch: Date.now() - 30_000,
    };
    const validCode = authenticator.generate(secret);
    authenticator.options = originalOptions;
    const success = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'totp@flashroute.test',
        password: TEST_PASSWORD,
        totpCode: validCode,
      },
    });

    expect(success.statusCode).toBe(200);
    expect(harness.listAuditActionsForUser('totp@flashroute.test')).toContain('user.2fa.enabled');
  });

  it('rate limits registration at 5 requests per minute per IP', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: {
          'x-forwarded-for': '198.18.0.10',
        },
        payload: {
          email: `register-limit-${attempt}@flashroute.test`,
          password: TEST_PASSWORD,
          name: `Register Limit ${attempt}`,
        },
      });

      expect(response.statusCode).toBe(201);
    }

    const limited = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'x-forwarded-for': '198.18.0.10',
      },
      payload: {
        email: 'register-limit-6@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Register Limit 6',
      },
    });

    expect(limited.statusCode).toBe(429);
  });

  it('verifies email tokens stored through the real auth flow', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'verify@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Verify User',
      },
    });

    const token = (await harness.getQueuedEmailJobs())[0]?.token;
    const verify = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({
      success: true,
      data: { message: 'Email verified' },
    });
    expect(harness.getUserByEmail('verify@flashroute.test')?.emailVerified).toBe(true);
    expect(harness.listAuditActionsForUser('verify@flashroute.test')).toContain('user.email_verified');
  });

  it('queues password reset and revokes active refresh families when resetting the password', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'reset@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Reset User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'reset@flashroute.test',
        password: TEST_PASSWORD,
      },
    });
    expect(login.statusCode).toBe(200);

    const forgot = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'reset@flashroute.test' },
    });

    expect(forgot.statusCode).toBe(200);

    const resetJob = (await harness.getQueuedEmailJobs()).find((job) => job.type === 'send-password-reset');
    const reset = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: {
        token: resetJob?.token,
        password: 'NewStrongPass2!',
      },
    });

    expect(reset.statusCode).toBe(200);

    const oldRefresh = login.json().data.refreshToken as string;
    const reuseOldRefresh = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldRefresh },
    });

    expect(reuseOldRefresh.statusCode).toBe(401);

    const loginWithNewPassword = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'reset@flashroute.test',
        password: 'NewStrongPass2!',
      },
    });
    expect(loginWithNewPassword.statusCode).toBe(200);

    const auditActions = harness.listAuditActionsForUser('reset@flashroute.test');
    expect(auditActions).toContain('user.password_reset.requested');
    expect(auditActions).toContain('user.password_reset.completed');
  });

  it('rate limits forgot-password at 3 requests per minute per IP+email', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'forgot-limit@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Forgot Limit User',
      },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        headers: {
          'x-forwarded-for': '198.18.0.11',
        },
        payload: {
          email: 'forgot-limit@flashroute.test',
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const limited = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: {
        'x-forwarded-for': '198.18.0.11',
      },
      payload: {
        email: 'forgot-limit@flashroute.test',
      },
    });

    expect(limited.statusCode).toBe(429);
  });

  it('rejects breached passwords during registration', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'breached@flashroute.test',
        password: 'Password123!',
        name: 'Breached User',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('stores pending two-factor secrets encrypted in redis', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'encrypted-2fa@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Encrypted Secret User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'encrypted-2fa@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const setup = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/users/me/2fa/setup',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(setup.statusCode).toBe(200);
    const rawPendingSecret = await harness.getRedisValue(`fr:2fa:pending:${harness.getUserByEmail('encrypted-2fa@flashroute.test')!.id}`);
    expect(rawPendingSecret).toEqual(expect.any(String));
    expect(rawPendingSecret).not.toBe(setup.json().data.secret as string);
  });

  it('writes refresh reuse audit logs without leaking raw token values', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'reuse-audit@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Reuse Audit User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'reuse-audit@flashroute.test',
        password: TEST_PASSWORD,
      },
    });
    const refreshToken = login.json().data.refreshToken as string;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
      headers: {
        'user-agent': 'FlashRoute-Test-Agent',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
      headers: {
        'user-agent': 'FlashRoute-Test-Agent',
      },
    });

    const reuseAuditLog = harness.findAuditLogByAction('auth.refresh.reuse_detected');
    expect(reuseAuditLog).toBeDefined();
    expect(JSON.stringify(reuseAuditLog?.details ?? {})).not.toContain(refreshToken);
    expect(reuseAuditLog?.details).toMatchObject({
      requestId: expect.any(String),
    });
    expect(reuseAuditLog?.details.userAgent).toBe('FlashRoute-Test-Agent');
  });
});
