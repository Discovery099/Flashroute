# Backend Auth: FlashRoute

---

## Overview

Complete authentication and authorization system for the FlashRoute SaaS dashboard. Handles registration, login, JWT token management, refresh token rotation, password reset, email verification, 2FA (TOTP), and API key management.

**Files created:** 8 files
**Estimated LOC:** 2,500-3,500

---

## Files

```
src/services/auth.service.ts         # Core auth business logic
src/services/user.service.ts         # User CRUD operations
src/services/apiKey.service.ts       # API key management
src/controllers/auth.controller.ts   # Auth route handlers
src/controllers/user.controller.ts   # User profile route handlers
src/controllers/apiKey.controller.ts # API key route handlers
src/routes/auth.routes.ts            # Auth route definitions
src/routes/user.routes.ts            # User route definitions
```

---

## AuthService (src/services/auth.service.ts)

### Method: register(input: RegisterInput): Promise<{ user: UserDTO }>

**Input:** `{ email: string, password: string, name: string }`

**Steps:**
1. Normalize email: `email.toLowerCase().trim()`
2. Query: `SELECT id FROM users WHERE email = $1` — if row exists, throw ConflictError("Email already registered")
3. Hash password: `bcrypt.hash(password, config.bcryptRounds)` (cost factor 12)
4. Insert user: `INSERT INTO users (email, password_hash, name, role, email_verified) VALUES ($1, $2, $3, 'monitor', false) RETURNING *`
5. Generate verification token: `generateToken(32)` → store in Redis: `SET fr:email_verify:{token} {userId} EX 86400` (24h TTL)
6. Queue email job: `emailQueue.add('send-verification', { userId, email, token })`
7. Create audit log: `{ action: 'user.register', resourceType: 'user', resourceId: userId }`
8. Return UserDTO (exclude password_hash, two_factor_secret)

**Error scenarios:**
- Email already exists → ConflictError (409)
- Database insert fails → InternalError (500)
- Email queue fails → Log warning, but still return success (email is non-critical)

---

### Method: login(input: LoginInput): Promise<{ accessToken, refreshToken, user }>

**Input:** `{ email: string, password: string, totpCode?: string }`

**Steps:**
1. Normalize email
2. Find user: `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`
3. If not found: throw UnauthorizedError("Invalid credentials") — do NOT reveal that email doesn't exist
4. If user.locked_until > NOW(): throw UnauthorizedError(`Account locked until ${locked_until}`)
5. Compare password: `bcrypt.compare(password, user.password_hash)`
6. If mismatch:
   - Increment: `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1`
   - If failed_login_count >= 5: `UPDATE users SET locked_until = NOW() + INTERVAL '30 minutes' WHERE id = $1`
   - Throw UnauthorizedError("Invalid credentials")
7. If user.two_factor_enabled:
   - If totpCode is missing: throw UnauthorizedError("2FA code required", { requiresTwoFactor: true })
   - Validate TOTP: `authenticator.verify({ token: totpCode, secret: user.two_factor_secret })`
   - If invalid: throw UnauthorizedError("Invalid 2FA code")
8. Reset failed attempts: `UPDATE users SET failed_login_count = 0, last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1`
9. Generate access token: `jwt.sign({ userId: user.id, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: config.jwtAccessTtl })`
10. Generate refresh token: `generateToken(64)` → hash → insert into refresh_tokens table with family_id, expires_at
11. Audit log: 'user.login'
12. Return { accessToken, refreshToken, expiresIn: config.jwtAccessTtl, user: UserDTO }

---

### Method: refreshTokens(refreshToken: string): Promise<{ accessToken, refreshToken, user }>

**Steps:**
1. Hash token: `hashToken(refreshToken)`
2. Find: `SELECT * FROM refresh_tokens WHERE token_hash = $1`
3. If not found: throw UnauthorizedError("Invalid refresh token")
4. If revoked_at IS NOT NULL:
   - **Token reuse detected** — potential session hijacking
   - Revoke ALL tokens in this family: `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`
   - Log security warning
   - Throw UnauthorizedError("Token reuse detected. All sessions revoked.")
5. If expires_at < NOW(): throw UnauthorizedError("Refresh token expired")
6. Revoke current token: `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`
7. Fetch user (may have been deleted/locked since token was issued)
8. Generate new token pair (same family_id), set replaced_by on old token
9. Return new tokens + updated UserDTO

---

### Method: logout(userId: string, refreshToken: string): Promise<void>

**Steps:**
1. Hash token, find by hash where user_id matches
2. If found and not revoked: set revoked_at = NOW()
3. Audit log: 'user.logout'

---

### Method: verifyEmail(token: string): Promise<void>

**Steps:**
1. Redis GET `fr:email_verify:{token}`
2. If null: throw ValidationError("Invalid or expired verification token")
3. Update user: `email_verified = true, email_verified_at = NOW()`
4. Redis DEL `fr:email_verify:{token}`

---

### Method: forgotPassword(email: string): Promise<void>

**Steps:**
1. Find user by email (normalized)
2. If not found: return silently (prevent enumeration)
3. Generate reset token → Redis SET `fr:password_reset:{token}` userId, TTL 3600 (1 hour)
4. Queue email: `emailQueue.add('send-password-reset', { userId, email, token })`

---

### Method: resetPassword(token: string, newPassword: string): Promise<void>

**Steps:**
1. Redis GET `fr:password_reset:{token}`
2. If null: throw ValidationError("Invalid or expired reset token")
3. Hash new password
4. Update user: `password_hash = $1`
5. Revoke ALL refresh tokens for this user
6. Redis DEL `fr:password_reset:{token}`
7. Audit log: 'user.password_reset'

---

### Method: setupTwoFactor(userId: string): Promise<{ secret, qrCodeUrl }>

**Steps:**
1. Generate TOTP secret using `otplib/authenticator.generateSecret()`
2. Generate QR code URI: `authenticator.keyuri(user.email, 'FlashRoute', secret)`
3. Store secret temporarily in Redis: `fr:2fa_setup:{userId}` = secret, TTL 600 (10 min)
4. Return { secret, qrCodeUrl }

---

### Method: verifyTwoFactor(userId: string, code: string): Promise<{ backupCodes: string[] }>

**Steps:**
1. Get pending secret from Redis: `fr:2fa_setup:{userId}`
2. Validate code against secret
3. If valid:
   - Encrypt secret → update user: `two_factor_enabled = true, two_factor_secret = encrypted`
   - Generate 10 backup codes (8-char random hex each) → hash each → store in database
   - Delete Redis key
   - Return plaintext backup codes (shown once)
4. If invalid: throw ValidationError("Invalid 2FA code")

---

### Method: disableTwoFactor(userId: string, code: string): Promise<void>

**Steps:**
1. Validate code against stored secret (or backup code)
2. Update user: `two_factor_enabled = false, two_factor_secret = NULL`
3. Delete backup codes

---

## UserService (src/services/user.service.ts)

### Method: getById(userId: string): Promise<UserDTO>

Query user with subscription join. Transform to UserDTO. Throw NotFoundError if not found or deleted.

### Method: update(userId: string, input: UpdateUserInput): Promise<UserDTO>

Update name, timezone, notification preferences. Validate input. Return updated UserDTO.

### Method: changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>

Verify current password. Hash new password. Update. Revoke all refresh tokens except current. Audit log.

### Method: toDTO(user: User): UserDTO

Strip sensitive fields (password_hash, two_factor_secret). Include subscription info if loaded. Format dates as ISO strings.

---

## ApiKeyService (src/services/apiKey.service.ts)

### Method: create(userId: string, input: CreateApiKeyInput): Promise<{ apiKey: ApiKeyDTO, plainKey: string }>

1. Check tier: must be 'trader' or higher
2. Check key count: max 5 for trader, 10 for executor, 20 for institutional
3. Generate: `fr_` + randomBytes(48).toString('hex')
4. Extract prefix: first 8 chars after `fr_`
5. Hash full key with SHA-256
6. Insert into api_keys table
7. Return DTO + plaintext key (only time it's shown)

### Method: list(userId: string): Promise<ApiKeyDTO[]>

Return all non-revoked keys. Never return key_hash. Show key_prefix for identification.

### Method: revoke(userId: string, keyId: string): Promise<void>

Find by id where user_id matches. Set revoked_at = NOW(). Audit log.

### Method: validate(fullKey: string): Promise<{ userId: string, permissions: string[] }>

Hash key, find by hash where not revoked and not expired. Update last_used_at. Return userId and permissions.

---

## Route Definitions

### Auth Routes (src/routes/auth.routes.ts)
```
POST /api/v1/auth/register        → authController.register       [public, rateLimit: 5/min per IP]
POST /api/v1/auth/login           → authController.login          [public, rateLimit: 10/min per IP]
POST /api/v1/auth/refresh         → authController.refresh        [public, rateLimit: 20/min per IP]
POST /api/v1/auth/logout          → authController.logout         [auth required]
POST /api/v1/auth/verify-email    → authController.verifyEmail    [public]
POST /api/v1/auth/forgot-password → authController.forgotPassword [public, rateLimit: 3/min per IP]
POST /api/v1/auth/reset-password  → authController.resetPassword  [public]
```

### User Routes (src/routes/user.routes.ts)
```
GET    /api/v1/users/me           → userController.getProfile     [auth required]
PATCH  /api/v1/users/me           → userController.updateProfile  [auth required]
PUT    /api/v1/users/me/password  → userController.changePassword [auth required]
POST   /api/v1/users/me/2fa/setup → userController.setup2FA      [auth required]
POST   /api/v1/users/me/2fa/verify→ userController.verify2FA     [auth required]
DELETE /api/v1/users/me/2fa       → userController.disable2FA     [auth required]
GET    /api/v1/api-keys           → apiKeyController.list         [auth required]
POST   /api/v1/api-keys           → apiKeyController.create       [auth required, tier: trader+]
PATCH  /api/v1/api-keys/:id       → apiKeyController.update       [auth required]
DELETE /api/v1/api-keys/:id       → apiKeyController.revoke       [auth required]
```

---

## Validation Schemas (Zod)

```typescript
// RegisterSchema
// { email: z.string().email().max(255), password: z.string().min(8).regex(strongPasswordRegex), name: z.string().min(2).max(100) }

// LoginSchema
// { email: z.string().email(), password: z.string().min(1), totpCode: z.string().length(6).optional() }

// UpdateProfileSchema
// { name: z.string().min(2).max(100).optional(), timezone: z.string().refine(isValidTimezone).optional(), notificationPreferences: NotificationPrefsSchema.optional() }

// ChangePasswordSchema
// { currentPassword: z.string().min(1), newPassword: z.string().min(8).regex(strongPasswordRegex) }

// CreateApiKeySchema
// { name: z.string().min(1).max(100), permissions: z.array(z.enum(['read', 'execute', 'admin'])).optional(), expiresAt: z.string().datetime().optional() }
```

---

## Test Cases (20 cases)

| # | Test | Input | Expected | Validates |
|---|---|---|---|---|
| 1 | Register success | Valid email, password, name | 201, user created, verification email queued | Happy path |
| 2 | Register duplicate email | Existing email | 409 CONFLICT | Unique constraint |
| 3 | Register weak password | "12345" | 400 VALIDATION_ERROR | Password strength |
| 4 | Login success | Valid credentials | 200, tokens returned | Auth flow |
| 5 | Login wrong password | Wrong password | 401, failed_login_count incremented | Failed login tracking |
| 6 | Login account locked | 5+ failed attempts | 401 with lockout message | Account lockout |
| 7 | Login with 2FA | Valid credentials + TOTP | 200 with tokens | 2FA flow |
| 8 | Login without 2FA code (2FA enabled) | Credentials only | 401 with requiresTwoFactor flag | 2FA enforcement |
| 9 | Refresh token success | Valid refresh token | 200, new token pair, old revoked | Token rotation |
| 10 | Refresh token reuse | Already-revoked token | 401, entire family revoked | Reuse detection |
| 11 | Refresh expired token | Expired refresh token | 401 | Token expiry |
| 12 | Logout | Valid refresh token | 200, token revoked | Logout |
| 13 | Email verification | Valid token | 200, email_verified=true | Verification flow |
| 14 | Email verification expired | Token past 24h | 400 | Token expiry |
| 15 | Password reset flow | Request + valid token + new password | Password updated, all tokens revoked | Reset flow |
| 16 | Get profile | Valid auth | 200 with user + subscription | Profile read |
| 17 | Create API key | Trader tier user | 201, key returned once | API key generation |
| 18 | Create API key monitor tier | Monitor tier user | 403 TIER_LIMIT | Tier enforcement |
| 19 | Use API key for auth | Valid X-API-Key header | Request authenticated | API key auth |
| 20 | Revoke API key | Valid key ID | 200, key revoked, subsequent use fails | Key revocation |


---

## Session Model, Token Storage, and Security Invariants

Authentication in FlashRoute is not just about dashboard access. A compromised account can activate strategies, read profitable route analytics, generate API keys, and potentially trigger costly automated behavior. The auth layer therefore needs explicit security invariants.

### Invariants

1. Access tokens are short-lived and stateless; refresh tokens are long-lived and stateful.
2. Refresh tokens are never stored in plaintext. Store only `sha256(token + refreshTokenPepper)`.
3. Every refresh token belongs to a `family_id`; rotation always revokes the presented token and issues a replacement in the same family.
4. Reuse of a previously revoked refresh token is treated as likely theft. Revoke the entire family and all API sessions for that user.
5. Password reset invalidates all active refresh tokens, all remembered 2FA recovery sessions, and all email verification tokens.
6. API keys are created once, shown once, and thereafter only their prefix and hash are stored.

### Refresh token table behavior

The implementation should include at least these columns in `refresh_tokens`:

- `id`, `user_id`, `family_id`, `token_hash`,
- `issued_at`, `expires_at`, `revoked_at`,
- `replaced_by_token_id`,
- `created_ip`, `created_user_agent`,
- `last_used_at`, `last_used_ip`,
- `reason_revoked` enum (`logout`, `rotation`, `reuse_detected`, `password_reset`, `admin_forced`, `account_locked`).

On successful refresh, update `last_used_at` for the old token before revocation so incident review can see the exact last use. On reuse detection, store a structured security log entry with family size, original issue date, user id, IP mismatch, and user agent mismatch.

## Authorization Matrix

Authorization must use both role checks and feature checks. Stripe status alone is not sufficient because admins may grant temporary overrides or grace periods.

| Capability | monitor | trader | executor | institutional | admin |
|---|---|---|---|---|---|
| View own dashboard | yes | yes | yes | yes | yes |
| Create API key | no | read-only | read/execute | read/execute/admin-limited | yes |
| Create strategies | limited backtest only | yes | yes | yes | yes |
| Activate live execution | no | no | yes | yes | yes |
| View admin routes | no | no | no | no | yes |
| Impersonate users | no | no | no | no | yes |

The coding agent should implement this as a `PermissionService` rather than scattering role comparisons across controllers. Route hooks can assert coarse role membership, but service methods must enforce business rules as well.

## Password Policy and Credential Lifecycle

A strong-password regex is not enough. Registration and password changes must additionally:

1. reject passwords containing normalized email local part or user name tokens,
2. reject the last 5 password hashes if password history is stored,
3. reject strings present in an internal top-10k breached-password list shipped with the backend,
4. enforce max length of 128 to avoid pathological bcrypt work.

`changePassword()` flow should:

1. require current password unless user is in password reset flow,
2. verify new password differs from current password,
3. hash new password,
4. insert prior hash into password history table,
5. update user row,
6. revoke all refresh tokens except optionally the current session if product wants seamless continuation; default is revoke all,
7. delete all outstanding password reset tokens,
8. write `user.password.changed` audit event.

## 2FA Enrollment and Recovery

TOTP is optional for lower tiers but strongly encouraged for executor and admin roles. The implementation should support these methods.

### setup2FA(userId)

1. Generate 20-byte base32 secret.
2. Build otpauth URI with issuer `FlashRoute`, account name = user email.
3. Return secret + QR code data URL, but do **not** enable 2FA yet.
4. Store encrypted pending secret in Redis key `fr:2fa:pending:{userId}` with TTL 10 minutes.

### verify2FA(userId, token)

1. Read pending secret from Redis.
2. Verify token with ±1 time-step window.
3. If valid, encrypt and persist secret to user row, set `two_factor_enabled=true`, generate 8 recovery codes.
4. Hash recovery codes before storing; show plaintext codes only once.
5. Delete pending Redis key and audit log `user.2fa.enabled`.

### disable2FA(userId, passwordOrTotp)

Require a fresh auth step: either current password or valid TOTP code. Disabling 2FA must revoke all refresh tokens issued before the disable timestamp.

### Recovery codes

- exactly 8 one-time-use codes,
- format `XXXX-XXXX` for human usability,
- each use sets `used_at` and records source IP,
- after 3 failed recovery-code attempts in 1 hour, require password reset or admin intervention.

## API Key Model

API keys are for programmatic read access and, for executor tiers, controlled execution actions. They must not inherit full browser-session capabilities by default.

Recommended API key format: `fr_live_<prefix>_<secret>` where prefix is 8 chars for lookup and secret is 32 random bytes base64url-encoded. Store:

- `key_prefix`,
- `key_hash`,
- `name`,
- `permissions` JSON array,
- `last_used_at`, `last_used_ip`,
- `expires_at`, `revoked_at`.

`authenticateApiKey()` middleware should:

1. parse `X-API-Key`,
2. extract prefix and query candidate row,
3. hash presented secret with pepper and compare constant-time,
4. reject if expired/revoked,
5. attach principal with `authMethod='api_key'`,
6. enforce route-level permission scopes.

Keys with `execute` scope must additionally require IP allowlisting or HMAC request signing for high-risk routes. The safer default is to allow API keys only for reads, strategy CRUD, and backtests; real trade execution should stay session-authenticated unless explicitly enabled for institutional users.

## Middleware Stack and Controller Behavior

Order matters for Fastify hooks:

1. request id + logger context,
2. rate limit hook,
3. raw body preservation for webhook routes only,
4. auth extraction,
5. principal loading from JWT or API key,
6. role/permission guard,
7. controller handler,
8. response audit hook for sensitive routes.

Sensitive routes (`/auth/login`, `/auth/refresh`, `/users/me/password`, `/users/me/2fa/*`) must be rate-limited by a composite key of IP + normalized email/user id. Example thresholds:

- register: 5/hour/IP,
- login: 10/15min/IP + email,
- forgot-password: 3/hour/IP + email,
- refresh: 30/hour/user,
- API key create/revoke: 20/hour/user.

## Audit Events and Incident Visibility

Every state-changing auth operation writes an audit row with:

- actor user id or anonymous marker,
- event name,
- IP,
- user agent,
- request id,
- target resource,
- structured metadata JSON.

Mandatory events: register, login success, login failure, account lock, unlock, email verification sent, email verified, password reset requested, password reset completed, 2FA enabled, 2FA disabled, recovery code used, API key created, API key revoked, refresh reuse detected, admin forced logout.

The key engineering point: audit metadata must never contain raw secrets, tokens, passwords, or plaintext recovery codes.
