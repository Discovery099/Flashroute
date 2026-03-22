# API Specification: FlashRoute

---

## Base Configuration

- **Base URL:** `/api/v1`
- **Content-Type:** `application/json` (request and response)
- **Authentication:** Bearer token (`Authorization: Bearer {token}`) or API key (`X-API-Key: {key}`)
- **WebSocket:** `wss://api.flashroute.io/ws` (authenticated via token query param)

### Rate Limits by Tier

| Tier | Requests/Minute | Requests/Hour | WebSocket Connections | Alerts/Day |
|---|---|---|---|---|
| Monitor (free) | 30 | 500 | 1 | 10 |
| Trader | 120 | 5,000 | 3 | 100 |
| Executor | 600 | 20,000 | 10 | Unlimited |
| Institutional | 3,000 | 100,000 | 50 | Unlimited |

### Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [{ "field": "email", "message": "Invalid email address" }],
    "timestamp": "2026-03-15T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

### Error Code Reference

| Code | HTTP Status | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Input failed Zod validation |
| UNAUTHORIZED | 401 | Missing or invalid token/API key |
| FORBIDDEN | 403 | Authenticated but insufficient tier/permissions |
| NOT_FOUND | 404 | Resource does not exist or not owned by user |
| CONFLICT | 409 | Duplicate unique field |
| RATE_LIMITED | 429 | Too many requests for tier |
| TIER_LIMIT | 403 | Feature requires higher subscription tier |
| EXECUTION_ERROR | 500 | Blockchain execution failure |
| INTERNAL_ERROR | 500 | Unexpected server error |

---

## Auth Endpoints (7 endpoints)

### POST /api/v1/auth/register
**Purpose:** Create a new user account.
**Auth:** Public | **Rate Limit:** 5/min per IP

**Request Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| email | string | YES | Valid email, max 255 chars |
| password | string | YES | Min 8 chars, must contain uppercase, lowercase, number, special char |
| name | string | YES | Min 2, max 100 chars |

**Business Logic:**
1. Validate input against RegisterSchema (Zod)
2. Normalize email to lowercase, trim
3. Check for existing user with same email — throw ConflictError if exists
4. Hash password with bcrypt (cost 12)
5. Insert user with role='monitor', email_verified=false
6. Generate 32-byte hex verification token → Redis key `email_verify:{token}` = userId, TTL 24h
7. Queue welcome email with verification link (async, non-blocking)
8. Return UserDTO

**Success (201):**
```json
{ "success": true, "data": { "user": { "id": "uuid", "email": "user@example.com", "name": "John", "role": "monitor", "emailVerified": false, "createdAt": "..." }, "message": "Check your email to verify." } }
```

**Errors:** 400 VALIDATION_ERROR | 409 CONFLICT | 500 INTERNAL_ERROR

---

### POST /api/v1/auth/login
**Purpose:** Authenticate and receive tokens.
**Auth:** Public | **Rate Limit:** 10/min per IP

**Request Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| email | string | YES | Valid email |
| password | string | YES | Non-empty |
| totpCode | string | NO | 6-digit TOTP code (required if 2FA enabled) |

**Business Logic:**
1. Validate input
2. Find user by email (lowercase) — throw UnauthorizedError if not found (generic message: "Invalid credentials")
3. Check locked_until — throw UnauthorizedError with lockout message if locked
4. Compare password with bcrypt — if mismatch: increment failed_login_count, lock account if >= 5 failures (30 min lockout), throw UnauthorizedError
5. If 2FA enabled: validate TOTP code — throw UnauthorizedError if invalid/missing
6. Reset failed_login_count to 0, update last_login_at, increment login_count
7. Generate access token (JWT, 15 min TTL, payload: { userId, role, email })
8. Generate refresh token (random 64-byte hex) → hash with SHA-256 → store in refresh_tokens table (7 day TTL)
9. Create audit log entry: 'user.login'
10. Return tokens + UserDTO

**Success (200):**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "abc123...", "expiresIn": 900, "user": { "id": "uuid", "email": "...", "name": "...", "role": "trader", "emailVerified": true } } }
```

**Errors:** 400 VALIDATION_ERROR | 401 UNAUTHORIZED | 500 INTERNAL_ERROR

---

### POST /api/v1/auth/refresh
**Purpose:** Exchange refresh token for new token pair.
**Auth:** Public | **Rate Limit:** 20/min per IP

**Request Body:**
| Field | Type | Required |
|---|---|---|
| refreshToken | string | YES |

**Business Logic:**
1. Hash provided token with SHA-256
2. Find refresh_tokens row by token_hash where revoked_at IS NULL and expires_at > NOW()
3. If not found: check if token_hash exists but IS revoked → token reuse detected → revoke ALL tokens in this family_id (security breach) → throw UnauthorizedError
4. Mark current token as revoked (revoked_at = NOW())
5. Generate new access token + new refresh token
6. Store new refresh token with same family_id, set replaced_by on old token
7. Return new token pair

**Success (200):** Same shape as login response (new tokens + user)
**Errors:** 401 UNAUTHORIZED | 500 INTERNAL_ERROR

---

### POST /api/v1/auth/logout
**Purpose:** Revoke refresh token.
**Auth:** Bearer token | **Rate Limit:** 20/min

**Request Body:**
| Field | Type | Required |
|---|---|---|
| refreshToken | string | YES |

**Business Logic:**
1. Hash token, find in refresh_tokens for current user
2. Mark as revoked (revoked_at = NOW())
3. Audit log: 'user.logout'

**Success (200):** `{ "success": true, "data": { "message": "Logged out" } }`

---

### POST /api/v1/auth/verify-email
**Purpose:** Verify email via token from verification email.
**Auth:** Public | **Rate Limit:** 10/min per IP

**Request Body:** `{ "token": "string" }`

**Business Logic:**
1. Look up Redis key `email_verify:{token}` → get userId
2. If not found: throw ValidationError "Invalid or expired token"
3. Update user: email_verified=true, email_verified_at=NOW()
4. Delete Redis key
5. Return success

**Success (200):** `{ "success": true, "data": { "message": "Email verified" } }`

---

### POST /api/v1/auth/forgot-password
**Purpose:** Send password reset email.
**Auth:** Public | **Rate Limit:** 3/min per IP

**Request Body:** `{ "email": "string" }`

**Business Logic:**
1. Find user by email — if not found, STILL return 200 (prevent email enumeration)
2. Generate 32-byte hex reset token → Redis `password_reset:{token}` = userId, TTL 1 hour
3. Queue password reset email
4. Return generic success message

**Success (200):** `{ "success": true, "data": { "message": "If that email exists, a reset link has been sent." } }`

---

### POST /api/v1/auth/reset-password
**Purpose:** Set new password via reset token.
**Auth:** Public | **Rate Limit:** 5/min per IP

**Request Body:** `{ "token": "string", "password": "string" }`

**Business Logic:**
1. Validate new password strength
2. Look up Redis `password_reset:{token}` → userId
3. Hash new password, update user
4. Revoke ALL refresh tokens for this user
5. Delete Redis key
6. Audit log: 'user.password_reset'

**Success (200):** `{ "success": true, "data": { "message": "Password updated. Please log in." } }`

---

## User & Profile Endpoints (4 endpoints)

### GET /api/v1/users/me
**Purpose:** Get current user profile.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Success (200):**
```json
{ "success": true, "data": { "user": { "id": "uuid", "email": "...", "name": "...", "role": "executor", "emailVerified": true, "timezone": "America/New_York", "twoFactorEnabled": false, "notificationPreferences": {}, "subscription": { "plan": "executor", "status": "active", "currentPeriodEnd": "..." }, "createdAt": "...", "updatedAt": "..." } } }
```

---

### PATCH /api/v1/users/me
**Purpose:** Update profile fields.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Request Body (all optional):**
| Field | Type | Validation |
|---|---|---|
| name | string | Min 2, max 100 |
| timezone | string | Valid IANA timezone |
| notificationPreferences | object | Valid notification schema |

**Business Logic:** Update only provided fields, audit log 'user.update', return updated user.

---

### PUT /api/v1/users/me/password
**Purpose:** Change password (while logged in).
**Auth:** Bearer token | **Rate Limit:** 5/min

**Request Body:** `{ "currentPassword": "string", "newPassword": "string" }`

**Business Logic:**
1. Verify currentPassword against stored hash
2. Hash newPassword, update user
3. Revoke all refresh tokens except current session
4. Audit log: 'user.password_change'

---

### POST /api/v1/users/me/2fa/setup | POST /api/v1/users/me/2fa/verify | DELETE /api/v1/users/me/2fa
**Purpose:** Setup, verify, and disable 2FA.
**Auth:** Bearer token | **Rate Limit:** 5/min

**Setup:** Generate TOTP secret → return secret + QR code URI
**Verify:** Validate TOTP code → enable 2FA → return backup codes
**Disable:** Validate TOTP code → disable 2FA

---

## Strategy Endpoints (6 endpoints)

### GET /api/v1/strategies
**Purpose:** List user's strategies.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:**
| Param | Type | Default | Description |
|---|---|---|---|
| chainId | integer | — | Filter by chain |
| isActive | boolean | — | Filter by active status |
| page | integer | 1 | Pagination |
| limit | integer | 20 | Items per page (max 100) |

**Success (200):**
```json
{ "success": true, "data": { "strategies": [{ "id": "uuid", "name": "ETH Mainnet Arb", "chainId": 1, "isActive": true, "minProfitUsd": 10.00, "maxTradeSizeUsd": 100000, "maxHops": 4, "allowedDexes": ["uniswap_v2", "uniswap_v3", "sushiswap"], "flashLoanProvider": "auto", "useFlashbots": true, "useDemandPrediction": true, "executionCount": 342, "totalProfitUsd": 4521.33, "createdAt": "..." }] }, "meta": { "page": 1, "limit": 20, "total": 3 } }
```

---

### POST /api/v1/strategies
**Purpose:** Create a new strategy.
**Auth:** Bearer token (executor+ tier) | **Rate Limit:** 10/min

**Request Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| name | string | YES | Min 1, max 100 |
| chainId | integer | YES | Must exist in supported_chains |
| minProfitUsd | number | NO | Default 10.00, min 0.01 |
| maxTradeSizeUsd | number | NO | Default 100000, min 100, max 10000000 |
| maxHops | integer | NO | Default 4, range 2-6 |
| allowedDexes | string[] | NO | Default all supported DEXes |
| flashLoanProvider | string | NO | Default 'auto', enum: auto/aave/balancer/dydx |
| useFlashbots | boolean | NO | Default true |
| maxGasPriceGwei | number | NO | Default 100, min 1 |
| riskBufferPct | number | NO | Default 0.50, range 0.01-5.00 |
| useDemandPrediction | boolean | NO | Default true |

**Business Logic:**
1. Validate input
2. Check user tier — must be 'executor' or higher to create strategies
3. Check strategy count limit (executor: 10, institutional: unlimited)
4. Validate chainId exists and has active executor contract
5. Insert strategy with is_active=false (must explicitly activate)
6. Audit log: 'strategy.create'

**Success (201):** Returns created strategy object

**Errors:** 400 VALIDATION_ERROR | 403 TIER_LIMIT | 404 NOT_FOUND (chainId)

---

### GET /api/v1/strategies/:id
**Purpose:** Get strategy details.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Business Logic:** Find strategy by id where user_id = current user. 404 if not found or not owned.

---

### PATCH /api/v1/strategies/:id
**Purpose:** Update strategy parameters.
**Auth:** Bearer token (executor+) | **Rate Limit:** 10/min

**Request Body:** Same fields as POST (all optional). Cannot change chainId after creation.

**Business Logic:**
1. Find strategy owned by user
2. If strategy is currently active: deactivate first, apply changes, user must reactivate
3. Update fields, audit log 'strategy.update'

---

### POST /api/v1/strategies/:id/activate
**Purpose:** Start executing a strategy.
**Auth:** Bearer token (executor+) | **Rate Limit:** 5/min

**Business Logic:**
1. Find strategy owned by user
2. Verify chain has active executor contract deployed
3. Verify user has sufficient tier
4. Set is_active=true
5. Publish Redis event `strategy:activated` — executor process picks it up
6. Audit log: 'strategy.activate'

**Success (200):** `{ "success": true, "data": { "strategy": { ... "isActive": true } } }`

---

### POST /api/v1/strategies/:id/deactivate
**Purpose:** Stop executing a strategy.
**Auth:** Bearer token (executor+) | **Rate Limit:** 5/min

**Business Logic:** Set is_active=false, publish `strategy:deactivated`, audit log.

---

## Trade Endpoints (4 endpoints)

### GET /api/v1/trades
**Purpose:** List trade execution history.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:**
| Param | Type | Default | Description |
|---|---|---|---|
| strategyId | UUID | — | Filter by strategy |
| chainId | integer | — | Filter by chain |
| status | string | — | Filter by status (confirmed, reverted, failed) |
| startDate | ISO date | 30 days ago | Trades after this date |
| endDate | ISO date | now | Trades before this date |
| minProfitUsd | number | — | Minimum net profit filter |
| sortBy | string | createdAt | Sort field: createdAt, netProfitUsd, gasUsed |
| sortOrder | string | desc | asc or desc |
| page | integer | 1 | Pagination |
| limit | integer | 20 | Max 100 |

**Success (200):**
```json
{ "success": true, "data": { "trades": [{ "id": "uuid", "strategyId": "uuid", "chainId": 42161, "status": "confirmed", "txHash": "0x...", "blockNumber": 185234567, "routePath": [{"pool": "0x...", "tokenIn": "WETH", "tokenOut": "USDC", "dex": "uniswap_v3"}, {"pool": "0x...", "tokenIn": "USDC", "tokenOut": "DAI", "dex": "curve"}, {"pool": "0x...", "tokenIn": "DAI", "tokenOut": "WETH", "dex": "sushiswap"}], "routeHops": 3, "flashLoanProvider": "balancer", "flashLoanAmountUsd": 50000, "profitUsd": 23.45, "gasCostUsd": 2.10, "netProfitUsd": 21.35, "simulatedProfitUsd": 24.00, "slippagePct": 0.25, "demandPredictionUsed": true, "executionTimeMs": 145, "createdAt": "..." }] }, "meta": { "page": 1, "limit": 20, "total": 342 } }
```

---

### GET /api/v1/trades/:id
**Purpose:** Get single trade with full details including per-hop breakdown.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Success (200):** Trade object + `hops` array with per-hop amounts, slippage, pool details.

---

### GET /api/v1/trades/summary
**Purpose:** Aggregate trade statistics for a date range.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** strategyId, chainId, startDate, endDate

**Success (200):**
```json
{ "success": true, "data": { "summary": { "totalTrades": 342, "successfulTrades": 298, "failedTrades": 44, "successRate": 87.13, "totalProfitUsd": 4521.33, "totalGasCostUsd": 823.45, "netProfitUsd": 3697.88, "avgProfitPerTradeUsd": 12.41, "maxProfitTradeUsd": 156.78, "avgExecutionTimeMs": 178, "topRoutes": [{ "path": "WETH→USDC→DAI→WETH", "count": 45, "totalProfit": 890.23 }], "profitByDay": [{ "date": "2026-03-14", "profit": 145.67, "trades": 28 }] } } }
```

---

### GET /api/v1/trades/live
**Purpose:** Get currently pending/active trade executions.
**Auth:** Bearer token (executor+) | **Rate Limit:** Per tier

**Business Logic:** Return trades with status IN ('pending', 'submitted') for current user.

---

## Routes & Opportunities Endpoints (4 endpoints)

### GET /api/v1/routes/opportunities
**Purpose:** Get current arbitrage opportunities discovered by the analytics engine.
**Auth:** Bearer token (trader+) | **Rate Limit:** Per tier

**Query Params:**
| Param | Type | Default | Description |
|---|---|---|---|
| chainId | integer | — | Filter by chain (required) |
| minProfitUsd | number | 1.00 | Minimum estimated profit |
| maxHops | integer | 4 | Max route hops |
| limit | integer | 20 | Max 50 |

**Business Logic:**
1. Read current opportunities from Redis sorted set `opportunities:{chainId}` (sorted by profit DESC)
2. Filter by params
3. Return top opportunities with route path, estimated profit, confidence score, discovered timestamp

**Success (200):**
```json
{ "success": true, "data": { "opportunities": [{ "id": "opp_abc123", "chainId": 42161, "routePath": [{"pool": "0x...", "tokenIn": "WETH", "tokenOut": "USDC", "dex": "uniswap_v3", "expectedOutput": "50025.00"}], "hops": 3, "estimatedProfitUsd": 34.56, "confidenceScore": 0.87, "flashLoanToken": "WETH", "flashLoanAmount": "20.0", "gasEstimateGwei": 0.15, "expiresInMs": 8500, "demandPrediction": { "impactedPools": 1, "predictedProfitChange": -2.3 }, "discoveredAt": "2026-03-15T10:30:00.123Z" }] } }
```

---

### GET /api/v1/routes/opportunities/:id
**Purpose:** Get detailed opportunity with full simulation results.
**Auth:** Bearer token (trader+) | **Rate Limit:** Per tier

---

### GET /api/v1/routes/graph-stats
**Purpose:** Get current arbitrage graph statistics.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId (required)

**Success (200):**
```json
{ "success": true, "data": { "graphStats": { "chainId": 42161, "totalTokens": 487, "totalPools": 2341, "activePools": 1876, "totalEdges": 4682, "negativeCyclesFound": 12, "lastUpdatedAt": "2026-03-15T10:30:00Z", "avgCycleDiscoveryTimeMs": 45, "poolsByDex": { "uniswap_v3": 892, "uniswap_v2": 456, "sushiswap": 312, "curve": 98, "balancer": 118 } } } }
```

---

### GET /api/v1/routes/demand-predictions
**Purpose:** Get current demand predictions from mempool analysis.
**Auth:** Bearer token (trader+) | **Rate Limit:** Per tier

**Query Params:** chainId (required), limit (default 20)

**Success (200):**
```json
{ "success": true, "data": { "predictions": [{ "poolAddress": "0x...", "dex": "uniswap_v3", "tokenPair": "WETH/USDC", "pendingSwapCount": 3, "totalPendingVolumeUsd": 125000, "predictedPriceImpactPct": 0.45, "direction": "token0_to_token1", "confidenceScore": 0.82, "estimatedBlockInclusion": 18523457, "createdAt": "..." }] } }
```

---

## Pool & Token Endpoints (5 endpoints)

### GET /api/v1/pools
**Purpose:** List monitored pools with current state.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId (required), dex, tokenSymbol, minTvlUsd, isActive, sortBy (tvlUsd/volume24hUsd), page, limit

**Success (200):** Paginated pool list with reserves, TVL, volume, last synced time.

---

### GET /api/v1/pools/:id
**Purpose:** Pool details with recent snapshots.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Success (200):** Pool details + last 100 snapshots for charting.

---

### GET /api/v1/tokens
**Purpose:** List known tokens.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId (required), symbol, isBlacklisted, page, limit

---

### GET /api/v1/tokens/:id
**Purpose:** Token details.
**Auth:** Bearer token

---

### GET /api/v1/chains
**Purpose:** List supported chains with status.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Success (200):**
```json
{ "success": true, "data": { "chains": [{ "chainId": 1, "name": "Ethereum", "blockTimeMs": 12000, "nativeTokenSymbol": "ETH", "isActive": true, "executorContractAddress": "0x...", "explorerUrl": "https://etherscan.io", "poolCount": 1234, "tokenCount": 487 }] } }
```

---

## Analytics Endpoints (5 endpoints)

### GET /api/v1/analytics/dashboard
**Purpose:** Aggregated dashboard data for the current user.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId, period (7d/30d/90d/all)

**Success (200):**
```json
{ "success": true, "data": { "dashboard": { "totalProfitUsd": 12456.78, "todayProfitUsd": 234.56, "totalTrades": 1234, "successRate": 87.5, "activeStrategies": 3, "profitTrend": [{ "date": "2026-03-08", "profit": 345.67 }, { "date": "2026-03-09", "profit": 423.12 }], "topStrategies": [{ "id": "uuid", "name": "ARB L2 Arb", "profit": 5678.90, "trades": 456 }], "gasCostTrend": [{ "date": "2026-03-08", "cost": 12.34 }], "recentTrades": [/* last 5 trades */] } } }
```

---

### GET /api/v1/analytics/daily
**Purpose:** Daily analytics breakdown.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId, strategyId, startDate, endDate, page, limit

**Success (200):** Paginated daily_analytics rows.

---

### GET /api/v1/analytics/routes
**Purpose:** Route performance analytics — which routes are most profitable.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId, strategyId, startDate, endDate, limit (default 20)

**Success (200):**
```json
{ "success": true, "data": { "routes": [{ "routeKey": "WETH→USDC→DAI→WETH", "dexes": "uniswap_v3→curve→sushiswap", "executionCount": 89, "successCount": 78, "totalProfitUsd": 1234.56, "avgProfitUsd": 15.83, "avgSlippagePct": 0.18, "avgExecutionTimeMs": 134, "lastExecutedAt": "..." }] } }
```

---

### GET /api/v1/analytics/competitors
**Purpose:** Competitor bot activity analysis.
**Auth:** Bearer token (trader+) | **Rate Limit:** Per tier

**Query Params:** chainId (required), startDate, endDate, limit

**Success (200):**
```json
{ "success": true, "data": { "competitors": [{ "botAddress": "0x...", "tradeCount": 456, "estimatedProfitUsd": 23456.78, "avgGasPriceGwei": 2.5, "mostUsedRoutes": ["WETH→USDC→WETH"], "firstSeenAt": "...", "lastSeenAt": "..." }], "totalCompetitorTrades": 12345, "ourWinRate": 23.4 } }
```

---

### GET /api/v1/analytics/gas
**Purpose:** Gas price analytics and optimization insights.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** chainId (required), period (24h/7d/30d)

**Success (200):**
```json
{ "success": true, "data": { "gas": { "currentBaseFeeGwei": 12.5, "avgBaseFee24h": 15.3, "avgPriorityFee24h": 0.5, "ourAvgGasCost": 2.34, "gasSpentTotalUsd": 823.45, "gasSavedByFlashbotsUsd": 145.67, "optimalExecutionHours": [2, 3, 4, 14, 15], "gasTrend": [{ "hour": 0, "avgBaseFee": 12.1 }] } } }
```

---

## Alert Endpoints (5 endpoints)

### GET /api/v1/alerts
**Purpose:** List user's alert configurations.
**Auth:** Bearer token | **Rate Limit:** Per tier

### POST /api/v1/alerts
**Purpose:** Create alert.
**Auth:** Bearer token | **Rate Limit:** 10/min

**Request Body:**
| Field | Type | Required | Validation |
|---|---|---|---|
| type | string | YES | Enum: opportunity_found, trade_executed, trade_failed, profit_threshold, gas_spike, system_error |
| chainId | integer | NO | Filter to specific chain |
| strategyId | UUID | NO | Filter to specific strategy |
| thresholdValue | number | NO | Numeric threshold (e.g., min profit USD) |
| deliveryChannel | string | YES | Enum: dashboard, email, telegram, webhook |
| deliveryConfig | object | NO | Channel config (webhookUrl, telegramChatId) |
| cooldownSeconds | integer | NO | Default 60, min 10 |

**Business Logic:**
1. Validate input
2. Check alert count limit (monitor: 5, trader: 20, executor: 100, institutional: unlimited)
3. If telegram: validate chat ID format. If webhook: validate URL format.
4. Insert alert
5. Return alert object

### GET /api/v1/alerts/:id
### PATCH /api/v1/alerts/:id
### DELETE /api/v1/alerts/:id

Standard CRUD. PATCH allows updating any field. DELETE soft-deletes (is_active=false).

---

## Alert History Endpoint (1 endpoint)

### GET /api/v1/alerts/:id/history
**Purpose:** Get delivery history for an alert.
**Auth:** Bearer token | **Rate Limit:** Per tier

**Query Params:** page, limit, startDate, endDate

---

## API Key Endpoints (4 endpoints)

### GET /api/v1/api-keys
**Purpose:** List user's API keys (shows prefix only, never full key).
**Auth:** Bearer token | **Rate Limit:** Per tier

### POST /api/v1/api-keys
**Purpose:** Generate new API key. Full key shown ONCE in response.
**Auth:** Bearer token (trader+) | **Rate Limit:** 5/min

**Request Body:**
| Field | Type | Required |
|---|---|---|
| name | string | YES |
| permissions | string[] | NO (default: ["read"]) |
| expiresAt | ISO date | NO |

**Business Logic:**
1. Generate 48-byte random key, prefix with `fr_`
2. Hash with SHA-256, store hash
3. Return full key in response (only time it's shown)

**Success (201):**
```json
{ "success": true, "data": { "apiKey": { "id": "uuid", "name": "Production Bot", "key": "fr_abc123...full_key_here", "keyPrefix": "fr_abc12", "permissions": ["read", "execute"], "createdAt": "..." }, "warning": "Save this key now. It cannot be retrieved again." } }
```

### DELETE /api/v1/api-keys/:id
**Purpose:** Revoke an API key.

### PATCH /api/v1/api-keys/:id
**Purpose:** Update key name or permissions (not the key itself).

---

## Subscription & Billing Endpoints (4 endpoints)

### GET /api/v1/billing/subscription
**Purpose:** Get current subscription details.
**Auth:** Bearer token

### POST /api/v1/billing/checkout
**Purpose:** Create Stripe checkout session for new subscription or upgrade.
**Auth:** Bearer token

**Request Body:** `{ "plan": "trader" | "executor" | "institutional" }`

**Business Logic:**
1. Look up Stripe price ID for plan
2. Create Stripe checkout session with customer ID, price, success/cancel URLs
3. Return checkout URL

**Success (200):** `{ "success": true, "data": { "checkoutUrl": "https://checkout.stripe.com/..." } }`

### POST /api/v1/billing/portal
**Purpose:** Create Stripe customer portal session (manage billing, cancel, invoices).
**Auth:** Bearer token

### POST /api/v1/billing/webhook
**Purpose:** Stripe webhook handler.
**Auth:** Stripe signature verification (no Bearer token)

**Events handled:**
- `checkout.session.completed` → activate subscription, update user role
- `customer.subscription.updated` → sync plan/status changes
- `customer.subscription.deleted` → downgrade to monitor
- `invoice.payment_failed` → update status to past_due, send alert
- `invoice.paid` → confirm payment, clear past_due

---

## Admin Endpoints (5 endpoints)

### GET /api/v1/admin/users
**Purpose:** List all users with filtering.
**Auth:** Bearer token (admin only)

**Query Params:** role, status, search (email/name), page, limit

### PATCH /api/v1/admin/users/:id
**Purpose:** Update user (role, lock/unlock, etc.).
**Auth:** Bearer token (admin only)

### POST /api/v1/admin/users/:id/impersonate
**Purpose:** Generate a short-lived impersonation session for support/debugging.
**Auth:** Bearer token (admin only)

**Business Logic:**
1. Verify current user has admin role
2. Load target user by `:id` — 404 if missing
3. Reject impersonation of deleted users or other admins unless a super-admin policy is introduced later
4. Generate short-lived JWT access token for target user (TTL: 5 minutes, marked with `impersonatedBy` claim)
5. Create audit log entry with admin user, target user, IP, and reason metadata if supplied
6. Return token and target-user summary

**Success (200):**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "expiresIn": 300, "targetUser": { "id": "uuid", "email": "user@example.com", "name": "Target User", "role": "executor" } } }
```

### GET /api/v1/admin/system/health
**Purpose:** System health check — all services.
**Auth:** Bearer token (admin only)

**Success (200):**
```json
{ "success": true, "data": { "health": { "database": "healthy", "redis": "healthy", "ethereumNode": { "status": "healthy", "blocksBehind": 0, "latestBlock": 18523456 }, "analyticsEngine": "running", "mempoolWorker": "running", "executor": "running", "poolIndexer": "running", "uptime": 345600, "memoryUsageMb": 2048 } } }
```

### GET /api/v1/admin/system/config
**Purpose:** Get/update system_config values.
**Auth:** Bearer token (admin only)

### PATCH /api/v1/admin/system/config
**Purpose:** Update system configuration.
**Auth:** Bearer token (admin only)

**Request Body:** `{ "key": "string", "value": "any" }`

---

## WebSocket API (1 endpoint)

### WS /ws
**Purpose:** Real-time updates for dashboard.
**Auth:** Query param `?token={accessToken}`

**Client → Server Messages:**
```json
{ "type": "subscribe", "channels": ["opportunities:42161", "trades:live", "system:alerts"] }
{ "type": "unsubscribe", "channels": ["opportunities:42161"] }
{ "type": "ping" }
```

**Server → Client Messages:**
```json
{ "type": "opportunity", "data": { /* same as GET /routes/opportunities item */ } }
{ "type": "trade_update", "data": { "tradeId": "uuid", "status": "confirmed", "netProfitUsd": 21.35 } }
{ "type": "alert", "data": { "type": "trade_executed", "message": "...", "tradeId": "uuid" } }
{ "type": "pool_update", "data": { "poolAddress": "0x...", "reserve0": "...", "reserve1": "..." } }
{ "type": "system", "data": { "message": "Pool indexer restarted", "severity": "info" } }
{ "type": "pong" }
```

**Channel permissions by tier:**
| Channel | Monitor | Trader | Executor | Institutional |
|---|---|---|---|---|
| system:alerts | ✅ | ✅ | ✅ | ✅ |
| trades:live | ❌ | ✅ | ✅ | ✅ |
| opportunities:{chainId} | ❌ | ✅ | ✅ | ✅ |
| pool_updates:{chainId} | ❌ | ❌ | ✅ | ✅ |
| demand_predictions:{chainId} | ❌ | ❌ | ✅ | ✅ |

---

## Endpoint Count Summary

| Category | Count |
|---|---|
| Auth | 7 |
| User & Profile | 6 (including 2FA) |
| Strategies | 6 |
| Trades | 4 |
| Routes & Opportunities | 4 |
| Pools & Tokens & Chains | 5 |
| Analytics | 5 |
| Alerts | 6 |
| API Keys | 4 |
| Billing | 4 |
| Admin | 5 |
| WebSocket | 1 |
| **Total** | **57** |
