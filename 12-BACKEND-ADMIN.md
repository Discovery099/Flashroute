# Backend Admin: FlashRoute

---

## Overview

Admin system for user management, system configuration, health monitoring, and operational controls. Only accessible to users with role='admin'.

**Files:** `src/services/admin.service.ts`, `src/controllers/admin.controller.ts`, `src/routes/admin.routes.ts`
**Estimated LOC:** 1,000-1,500

---

## AdminService (src/services/admin.service.ts)

### Method: listUsers(filters: UserFilters): Promise<PaginatedResult<UserDTO>>

**Filters:** role, status (active/locked/deleted), search (email/name substring), sortBy, sortOrder, page, limit

**Query:** Join users with subscriptions. Apply filters. Return paginated list with subscription info.

### Method: updateUser(userId: string, updates: AdminUserUpdate): Promise<UserDTO>

**Allowed updates:** role (tier override), locked_until (lock/unlock), deleted_at (soft delete/restore)

**Steps:**
1. Find user by ID
2. Apply updates
3. If role changed: sync with Stripe subscription if applicable
4. If locked: revoke all refresh tokens
5. Audit log: 'admin.user.update'

### Method: getSystemHealth(): Promise<SystemHealth>

**Checks (all with 5-second timeouts):**
1. **Database:** `SELECT 1` → healthy/unhealthy
2. **Redis:** `PING` → healthy/unhealthy
3. **Ethereum node per chain:**
   - Get latest block number
   - Compare with known chain head (from external source or recent trend)
   - If > 2 blocks behind: degraded
   - If unreachable: unhealthy
4. **Worker processes:** Check Redis heartbeat keys:
   - Each worker writes `fr:heartbeat:{workerName}` every 30 seconds
   - If heartbeat is older than 60 seconds: not running
5. **System metrics:** memory usage (process.memoryUsage()), uptime (process.uptime())

**Return:**
```typescript
{
  database: 'healthy' | 'unhealthy',
  redis: 'healthy' | 'unhealthy',
  chains: { [chainId]: { status, latestBlock, blocksBehind } },
  workers: { analyticsEngine, mempoolWorker, executor, poolIndexer, jobsWorker },
  system: { uptimeSeconds, memoryUsageMb, nodeVersion }
}
```

### Method: getSystemConfig(): Promise<SystemConfig[]>

Read all rows from system_config table. Return key-value pairs with descriptions.

### Method: updateSystemConfig(key: string, value: any, adminUserId: string): Promise<void>

**Steps:**
1. Validate key exists in system_config
2. Validate value type matches expected type for this key
3. Update value, set updated_by = adminUserId
4. Publish config change event to Redis (workers reload config)
5. Audit log: 'admin.config.update'

**Configurable runtime settings:**

| Key | Type | Default | Description |
|---|---|---|---|
| global_min_profit_usd | number | 10 | Global minimum profit threshold |
| max_concurrent_executions | number | 1 | Max simultaneous arbitrage executions per chain |
| mempool_monitoring_enabled | boolean | true | Enable/disable mempool monitoring |
| profit_sweep_enabled | boolean | true | Enable/disable automatic profit sweeping |
| new_registration_enabled | boolean | true | Allow new user registrations |
| maintenance_mode | boolean | false | Disable all execution, show maintenance page |

### Method: impersonateUser(adminUserId: string, targetUserId: string): Promise<{ accessToken: string }>

**Steps:**
1. Verify admin role
2. Generate access token for target user (short TTL: 5 minutes)
3. Audit log: 'admin.impersonate' with both user IDs
4. Return access token (admin can use it to see dashboard as the target user)

---

## Routes

```
GET   /api/v1/admin/users              → adminController.listUsers        [admin]
PATCH /api/v1/admin/users/:id          → adminController.updateUser       [admin]
POST  /api/v1/admin/users/:id/impersonate → adminController.impersonate  [admin]
GET   /api/v1/admin/system/health      → adminController.getHealth        [admin]
GET   /api/v1/admin/system/config      → adminController.getConfig        [admin]
PATCH /api/v1/admin/system/config      → adminController.updateConfig     [admin]
```

---

## Test Cases (8 cases)

| # | Test | Expected | Validates |
|---|---|---|---|
| 1 | List users as admin | Paginated user list with subscriptions | User listing |
| 2 | List users as non-admin | 403 FORBIDDEN | Authorization |
| 3 | Update user role | Role changed, audit logged | User management |
| 4 | Lock user account | User locked, tokens revoked | Account lockout |
| 5 | System health — all healthy | All services report healthy | Health check |
| 6 | System health — node behind | Chain status shows 'degraded' | Degraded detection |
| 7 | Update system config | Value updated, config change event published | Runtime config |
| 8 | Impersonate user | Short-lived token for target user returned | Impersonation |


---

## Admin Boundary and Safety Model

Admin features are operational controls over a live trading system, not convenience CRUD. Every endpoint must be designed as though a mistaken click could disable revenue or expose customer data.

### Access requirements

Admin routes require:

1. authenticated user with `role='admin'`,
2. recent authentication freshness for high-risk actions (for example within 15 minutes or step-up with password/TOTP),
3. audit logging of request body diff and target resource,
4. CSRF protection if browser-cookie auth is ever added; with bearer tokens, still require origin checks for the dashboard.

High-risk actions include impersonation, runtime config changes, user role overrides, and maintenance mode toggles.

## User Administration Details

`listUsers()` should support operational filtering that matches real support workflows:

- billing status (`active`, `trialing`, `past_due`, `canceled`, `free`),
- last login window,
- role override present yes/no,
- 2FA enabled yes/no,
- strategy count,
- chain activity in last 7/30 days.

The response should include summary fields only, not sensitive internals like password hashes, TOTP secrets, or raw API key metadata.

`updateUser()` must distinguish between **subscription-derived role** and **admin override role**. If an admin grants temporary executor access to a trader, store an override record with optional expiry rather than overwriting Stripe-derived source of truth. That makes later billing reconciliation deterministic.

## System Health Semantics

`getSystemHealth()` should return both component status and severity:

- `healthy`: service within SLA,
- `degraded`: working but outside normal thresholds,
- `unhealthy`: not functioning,
- `unknown`: insufficient data.

Suggested thresholds:

- Redis latency > 50 ms average over sample window => degraded,
- DB ping > 200 ms => degraded, > 1000 ms => unhealthy,
- chain head lag 1-2 blocks => degraded, >2 blocks => unhealthy on mainnet,
- worker heartbeat older than 60s => degraded, older than 180s => unhealthy,
- queue oldest waiting job age > 5 min for alerts/email => degraded.

Return sample metrics, not just booleans, so the dashboard can show why a component is degraded.

## Runtime Config Mutation Rules

Runtime config is powerful and easy to misuse. `updateSystemConfig()` must enforce per-key validation and side effects.

Examples:

- `global_min_profit_usd` must be between 0 and 10,000.
- `max_concurrent_executions` must be integer 1-10.
- `maintenance_mode` toggle should publish high-priority event so executor immediately stops accepting new trades.
- `profit_sweep_enabled=false` should not interrupt an in-flight sweep; it only prevents new sweeps.

Config rows should include `is_secret`, `value_type`, `schema_json`, `restart_required`, and `updated_by`. Secret values are not editable from dashboard unless there is an explicit secret-management design; default is no.

## Impersonation Rules

Impersonation is useful for support but dangerous. Implementation requirements:

1. impersonation token claim set includes `impersonatedBy`, `targetUserId`, `scope='support_impersonation'`, `exp<=5m`;
2. token cannot call admin routes, billing webhook routes, or execution submission endpoints;
3. dashboard UI shows persistent banner `Viewing as user@example.com`;
4. every impersonated request writes audit log with both actor and target ids;
5. optional requirement: target user must have support-consent flag for non-emergency impersonation.

## Admin Routes to Add Behaviorally

Even if the file list stays small, the service should also cover:

- `POST /api/v1/admin/system/maintenance/on`
- `POST /api/v1/admin/system/maintenance/off`
- `POST /api/v1/admin/strategies/:id/pause`
- `POST /api/v1/admin/strategies/:id/resume`
- `GET /api/v1/admin/queues`

These can be controller methods in the same files. The point is operational completeness: admins need direct controls for a revenue system under incident response.

## Audit and Compliance Notes

Every admin action should write structured audit metadata:

- before/after diff,
- reason string supplied by admin for sensitive changes,
- IP/user agent,
- request id,
- target user/config/strategy id.

For destructive or high-risk actions, require a `reason` field in the request body. That forces deliberate operation and leaves a review trail.


## Response Shapes and Support Workflows

`getSystemHealth()` response should include recent incident summaries such as last executor failure time, count of paused strategies, and oldest unconfirmed trade age. Those values let an admin assess whether to intervene without digging through raw logs.

`listUsers()` should also return aggregate counts in pagination metadata: total users, active subscribers, past-due users, locked users. Support dashboards need both the page of rows and the high-level counts.

## Additional Test Cases

9. Admin override role with expiry → user receives elevated entitlements until expiry then reverts.
10. Maintenance mode on → execution routes reject new submissions while read-only admin routes still work.
11. Impersonation token used on admin route → 403 forbidden.
12. Config update with invalid type/range → 400 validation error and no publish event.


## Queue and Worker Visibility

Admins need quick visibility into queue backlog by name, active count, delayed count, failed count, and oldest waiting job age. Even if this is exposed from the same `admin.service.ts`, the response should be a separate DTO so the frontend can render incident cards and not parse raw BullMQ structures.


## Minimal Admin Metrics

Expose counts for paused strategies, unhealthy chains, pending support impersonations, and users with expiring admin overrides. Those are the day-to-day levers an operator needs.


## Session Review Support

Admin tooling should surface active session count and last refresh-token family issue time for each user so support can revoke sessions intelligently during account-compromise incidents.


Admin endpoints should favor explicit reason codes over free-form booleans wherever possible.


Prefer soft-delete and reversible ops where possible.


All admin mutations need strong validation.


Validation failures should be explicit.


Audit every override carefully.


Surface lock reasons.


Expose worker lag.


Keep diffs.


Track pauses.


Track overrides.


Log reasons.
