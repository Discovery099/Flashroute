import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createHarness = createTestApiHarness;

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createHarness>>['app'] }).app;

  await app?.close();
});

describe('admin routes', () => {
  it('list users as admin returns paginated users', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'regular@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Regular User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toBeInstanceOf(Array);
    expect(body.data.meta.total).toBeGreaterThan(0);
  });

  it('list users as non-admin returns 403', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'regular@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Regular User',
      },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'regular@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('update user role creates audit log', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'target@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Target User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const targetUser = harness.getUserByEmail('target@flashroute.test');
    harness.setUserRole(targetUser!.id, 'monitor');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${targetUser!.id}`,
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
      payload: {
        role: 'trader',
        reason: 'testing',
      },
    });

    expect(response.statusCode).toBe(200);

    const updatedUser = harness.getUserByEmail('target@flashroute.test');
    expect(updatedUser?.role).toBe('trader');

    const auditLog = harness.findAuditLogByAction('admin.user.update');
    expect(auditLog).toBeDefined();
  });

  it('lock user account', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'target@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Target User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const targetUser = harness.getUserByEmail('target@flashroute.test');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${targetUser!.id}`,
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
      payload: {
        lockedUntil: '2030-01-01T00:00:00Z',
      },
    });

    expect(response.statusCode).toBe(200);

    const lockedUser = harness.getUserByEmail('target@flashroute.test');
    expect(lockedUser?.lockedUntil).toBeInstanceOf(Date);
  });

  it('system health returns all health checks', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/health',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveProperty('database');
    expect(body.data).toHaveProperty('redis');
    expect(body.data).toHaveProperty('chains');
    expect(body.data).toHaveProperty('workers');
    expect(body.data).toHaveProperty('system');
  });

  it('update system config', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/config',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/system/config',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
      payload: {
        key: 'global_min_profit_usd',
        value: 100,
        reason: 'testing',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('impersonate user returns access token', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'target@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Target User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const targetUser = harness.getUserByEmail('target@flashroute.test');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${targetUser!.id}/impersonate`,
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.accessToken).toEqual(expect.any(String));
  });

  it('impersonation token cannot access admin routes', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'target@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Target User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const targetUser = harness.getUserByEmail('target@flashroute.test');

    const adminLogin = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const impersonate = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${targetUser!.id}/impersonate`,
      headers: {
        authorization: `Bearer ${adminLogin.json().data.accessToken as string}`,
      },
    });

    const impersonationToken = impersonate.json().data.accessToken as string;

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: {
        authorization: `Bearer ${impersonationToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('maintenance mode on', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/maintenance/on',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
      payload: {
        reason: 'testing',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('maintenance mode off', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/maintenance/off',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('config validation error returns 400', async (context) => {
    const harness = await createHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Admin User',
      },
    });

    const adminUser = harness.getUserByEmail('admin@flashroute.test');
    harness.setUserRole(adminUser!.id, 'admin');

    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/system/config',
      headers: {
        authorization: `Bearer ${login.json().data.accessToken as string}`,
      },
      payload: {
        key: 'global_min_profit_usd',
        value: 99999,
        reason: 'testing',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
