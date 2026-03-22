# Backend Foundation: FlashRoute

---

## Overview

This file specifies the foundational infrastructure layer that every other backend component depends on: project structure, configuration system, custom error hierarchy, logging, database and Redis clients, blockchain clients, and shared utility functions.

**Files created:** ~25 files
**Estimated LOC:** 3,000-4,000

---

## Project Directory Structure

```
flashroute/
├── src/
│   ├── config/
│   │   ├── index.ts                 # Configuration loader with Zod validation
│   │   ├── chains.ts                # Chain-specific configuration
│   │   └── constants.ts             # Global constants (fee rates, selectors, etc.)
│   ├── errors/
│   │   ├── base.ts                  # AppError base class
│   │   ├── auth.ts                  # UnauthorizedError, ForbiddenError
│   │   ├── validation.ts            # ValidationError
│   │   ├── blockchain.ts            # BlockchainError, SimulationError, ExecutionError
│   │   ├── billing.ts               # TierLimitError, PaymentError
│   │   └── index.ts                 # Re-exports all errors
│   ├── lib/
│   │   ├── logger.ts                # Pino logger with structured JSON
│   │   ├── database.ts              # Prisma client initialization
│   │   ├── redis.ts                 # Redis client (ioredis) with pub/sub
│   │   ├── ethereum.ts              # ethers.js provider + wallet management
│   │   ├── flashbots.ts             # Flashbots bundle provider
│   │   └── stripe.ts                # Stripe client initialization
│   ├── middleware/
│   │   ├── auth.ts                  # JWT validation middleware
│   │   ├── apiKey.ts                # API key validation middleware
│   │   ├── rateLimiter.ts           # Tier-based rate limiting
│   │   ├── errorHandler.ts          # Global error handler
│   │   └── requestId.ts             # Adds requestId to every request
│   ├── utils/
│   │   ├── bigNumber.ts             # BigNumber helpers for blockchain math
│   │   ├── address.ts               # Address validation and checksumming
│   │   ├── token.ts                 # Token decimal normalization utilities
│   │   ├── pagination.ts            # Standard pagination helper
│   │   ├── date.ts                  # Date formatting and range utilities
│   │   └── crypto.ts                # Hashing, token generation utilities
│   ├── services/                    # Domain services (covered in later context files)
│   ├── controllers/                 # Route controllers
│   ├── routes/                      # Fastify route registration
│   ├── workers/                     # Background worker entry points
│   ├── jobs/                        # BullMQ job definitions
│   └── server.ts                    # Fastify server initialization and plugin registration
├── prisma/
│   ├── schema.prisma                # Database schema
│   ├── seed.ts                      # Seed script
│   └── migrations/                  # Prisma migrations
├── contracts/                       # Solidity smart contracts (Hardhat/Foundry project)
│   ├── src/
│   │   └── FlashRouteExecutor.sol
│   ├── test/
│   └── hardhat.config.ts
├── tests/                           # Test files (mirrors src/ structure)
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   └── nginx.conf
├── .env.example
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Configuration System (src/config/index.ts)

All configuration is loaded from environment variables, validated with Zod at startup. If any required variable is missing or invalid, the application fails to start with a clear error message.

### Environment Variables

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| NODE_ENV | string | YES | — | development, staging, production |
| PORT | number | NO | 3000 | API server port |
| DATABASE_URL | string | YES | — | PostgreSQL connection string |
| REDIS_URL | string | YES | — | Redis connection string |
| JWT_SECRET | string | YES | — | JWT signing secret (min 32 chars) |
| JWT_ACCESS_TTL | number | NO | 900 | Access token TTL in seconds |
| JWT_REFRESH_TTL | number | NO | 604800 | Refresh token TTL in seconds (7 days) |
| BCRYPT_ROUNDS | number | NO | 12 | bcrypt cost factor |
| STRIPE_SECRET_KEY | string | YES* | — | Stripe API key (*not required for bot-only mode) |
| STRIPE_WEBHOOK_SECRET | string | YES* | — | Stripe webhook signing secret |
| ETHEREUM_RPC_URL | string | YES | — | Primary Ethereum RPC endpoint |
| ETHEREUM_WS_URL | string | YES | — | Primary WebSocket endpoint |
| ETHEREUM_PRIVATE_KEY | string | YES | — | Execution wallet private key (encrypted recommended) |
| COLD_WALLET_ADDRESS | string | YES | — | Profit sweep destination |
| FLASHBOTS_AUTH_KEY | string | NO | — | Flashbots authentication signer key |
| ALCHEMY_API_KEY | string | NO | — | Alchemy fallback RPC |
| ETHERSCAN_API_KEY | string | NO | — | Etherscan for contract ABIs |
| TELEGRAM_BOT_TOKEN | string | NO | — | For alert delivery |
| TELEGRAM_CHAT_ID | string | NO | — | Alert destination chat |
| LOG_LEVEL | string | NO | info | Pino log level |
| CORS_ORIGIN | string | NO | http://localhost:5173 | Allowed CORS origins (comma-separated) |
| PROFIT_SWEEP_INTERVAL_BLOCKS | number | NO | 100 | Blocks between profit sweeps |
| MIN_PROFIT_USD | number | NO | 10 | Global minimum profit threshold |
| MAX_GAS_PRICE_GWEI | number | NO | 100 | Global gas ceiling |

### Zod Validation Schema

```typescript
// config/index.ts structure:
// 1. Define envSchema with Zod (z.object with all variables)
// 2. Parse process.env through schema
// 3. Export typed config object
// 4. If validation fails: log detailed error showing which variables are wrong/missing, then process.exit(1)
```

### Chain Configuration (src/config/chains.ts)

Hardcoded chain configurations loaded at startup, supplemented by database entries:

```typescript
// Structure per chain:
// {
//   chainId: number,
//   name: string,
//   rpcUrl: string (from env or database),
//   wsUrl: string,
//   flashbotsRelayUrl: string | null,
//   blockTimeMs: number,
//   nativeToken: { symbol, decimals, coingeckoId },
//   dexes: { name, routerAddress, factoryAddress, version }[],
//   flashLoanProviders: { name, poolAddress, feeRate }[],
//   explorerUrl: string,
//   explorerApiUrl: string,
//   explorerApiKey: string
// }
```

### Constants (src/config/constants.ts)

```typescript
// DEX function selectors for mempool decoding
// Token addresses per chain (WETH, USDC, USDT, DAI, WBTC)
// Flash loan provider addresses per chain
// Gas estimates per operation type
// Known router addresses per chain per DEX
// Rate limit tiers: { monitor: {rpm: 30, rph: 500}, trader: {...}, ... }
// Subscription plan → Stripe price ID mapping
```

---

## Custom Error Hierarchy (src/errors/)

### Base Error (base.ts)

```typescript
// AppError extends Error
// Properties:
//   statusCode: number (HTTP status)
//   code: string (machine-readable error code)
//   details?: any (additional context, e.g., validation field errors)
//   isOperational: boolean (true = expected error, false = programming bug)
//
// Constructor: (message, statusCode, code, details?, isOperational = true)
```

### Error Classes

| Class | Status | Code | When Used |
|---|---|---|---|
| ValidationError | 400 | VALIDATION_ERROR | Zod schema validation failure; includes `details` array of field-level errors |
| UnauthorizedError | 401 | UNAUTHORIZED | Missing/expired/invalid JWT or API key |
| ForbiddenError | 403 | FORBIDDEN | Valid auth but insufficient role/tier |
| NotFoundError | 404 | NOT_FOUND | Resource doesn't exist or not owned by user |
| ConflictError | 409 | CONFLICT | Duplicate unique constraint (email, etc.) |
| RateLimitError | 429 | RATE_LIMITED | Tier rate limit exceeded; includes `retryAfter` seconds |
| TierLimitError | 403 | TIER_LIMIT | Feature requires higher subscription; includes `requiredTier` |
| BlockchainError | 500 | BLOCKCHAIN_ERROR | RPC call failure, node unavailable |
| SimulationError | 500 | SIMULATION_ERROR | Swap simulation failure (revert, overflow) |
| ExecutionError | 500 | EXECUTION_ERROR | Transaction submission/confirmation failure |
| PaymentError | 402 | PAYMENT_ERROR | Stripe payment failure |
| InternalError | 500 | INTERNAL_ERROR | Unexpected errors (catch-all) |

---

## Logger (src/lib/logger.ts)

Pino logger with structured JSON output. Every log line includes:
- `timestamp` (ISO 8601)
- `level` (info, warn, error, debug, trace)
- `service` (api-server, analytics-engine, mempool-worker, executor, pool-indexer)
- `requestId` (for API requests, from middleware)
- `correlationId` (for arbitrage cycles, tracks route from discovery through execution)

**Redaction:** Automatically redact sensitive fields in log output:
- `password`, `passwordHash`, `token`, `refreshToken`, `privateKey`, `secret`, `apiKey`

**Child loggers:** Each service creates a child logger with `service` field pre-set:
```typescript
// const logger = createLogger('analytics-engine')
// logger.info({ routeId, profit: 23.45 }, 'Route discovered')
```

---

## Database Client (src/lib/database.ts)

Prisma client initialization with:
- Connection pooling via PgBouncer-compatible settings
- Query logging in development (log: ['query', 'error', 'warn'])
- Error logging in production (log: ['error', 'warn'])
- Graceful shutdown: `prisma.$disconnect()` on SIGINT/SIGTERM
- Health check method: `SELECT 1` query with 5-second timeout

---

## Redis Client (src/lib/redis.ts)

ioredis client with:
- Automatic reconnection with exponential backoff
- Separate clients for commands vs. pub/sub (ioredis requirement)
- Connection pool: 10 connections for commands
- Health check method: `PING` with 2-second timeout
- Key prefix: `fr:` (flashroute) for namespace isolation
- Graceful shutdown: `redis.quit()` on SIGINT/SIGTERM

**Pub/Sub channels (defined as constants):**
```
fr:pool:update, fr:route:discovered, fr:pending:swap,
fr:demand:prediction, fr:execution:result, fr:system:alert,
fr:strategy:activated, fr:strategy:deactivated
```

---

## Blockchain Clients (src/lib/ethereum.ts)

### Provider Setup
- Primary: WebSocket provider connected to own node or Alchemy
- Fallback: HTTP provider to secondary RPC endpoint
- Automatic failover: if primary disconnects, switch to fallback, attempt primary reconnection every 30 seconds
- Block subscription: listen for `block` events, emit to Redis pub/sub

### Wallet Management
- Execution wallet: loaded from ETHEREUM_PRIVATE_KEY environment variable
- Nonce management: track nonce locally, increment on submission, sync from chain on startup and periodically
- Transaction signing: sign locally, submit via Flashbots or direct RPC

### Flashbots Client (src/lib/flashbots.ts)
- FlashbotsBundleProvider from @flashbots/ethers-provider-bundle
- Authentication signer: separate from execution wallet (for privacy)
- Bundle simulation: `flashbotsProvider.simulate()` before submission
- Bundle submission: `flashbotsProvider.sendBundle()` with target block number
- Bundle status tracking: poll `flashbotsProvider.getBundleStats()`

---

## Middleware

### Auth Middleware (src/middleware/auth.ts)
1. Extract token from `Authorization: Bearer {token}` header
2. Verify JWT signature and expiry
3. Decode payload: { userId, role, email }
4. Attach to request: `request.user = { userId, role, email }`
5. If invalid/expired: throw UnauthorizedError

### API Key Middleware (src/middleware/apiKey.ts)
1. Extract key from `X-API-Key` header
2. Extract prefix (first 8 chars)
3. Find api_keys row by prefix where revoked_at IS NULL
4. Hash full key with SHA-256, compare with stored hash
5. Check expiry (expires_at)
6. Update last_used_at
7. Attach to request: `request.user = { userId, role, permissions }`

### Rate Limiter (src/middleware/rateLimiter.ts)
- Redis-backed sliding window rate limiter
- Key pattern: `fr:ratelimit:{userId}:{endpoint}:{window}`
- Window: 1 minute
- Limits from config by tier
- On exceed: throw RateLimitError with `retryAfter` header
- Per-endpoint overrides for sensitive endpoints (register: 5/min, login: 10/min)

### Error Handler (src/middleware/errorHandler.ts)
- Fastify `setErrorHandler`
- If error is AppError (isOperational=true): return structured error response with error's statusCode and code
- If error is Zod validation error: transform to ValidationError with field details
- If error is Prisma known error (P2002 unique constraint): transform to ConflictError
- If unknown error: log full stack trace as error, return InternalError to client (don't leak internals)

### Request ID (src/middleware/requestId.ts)
- Generate UUID v4 for every request
- Attach to `request.id`
- Include in all log lines and response headers (`X-Request-Id`)

---

## Utility Functions

### BigNumber Helpers (src/utils/bigNumber.ts)
- `toBigInt(value: string | number | bigint): bigint` — safe conversion
- `fromBigInt(value: bigint, decimals: number): string` — human-readable with decimal point
- `mulDiv(a: bigint, b: bigint, c: bigint): bigint` — multiply then divide without overflow (for percentage calculations)
- `sqrt(value: bigint): bigint` — integer square root (for Uniswap V3 math)
- `min(a: bigint, b: bigint): bigint`, `max(a: bigint, b: bigint): bigint`

### Address Utilities (src/utils/address.ts)
- `isValidAddress(address: string): boolean` — EIP-55 checksum validation
- `checksumAddress(address: string): string` — convert to checksummed format
- `areAddressesEqual(a: string, b: string): boolean` — case-insensitive comparison
- `shortenAddress(address: string): string` — "0x1234...5678" for display

### Token Utilities (src/utils/token.ts)
- `normalizeAmount(amount: bigint, decimals: number): number` — convert from raw to human-readable
- `denormalizeAmount(amount: number, decimals: number): bigint` — convert from human to raw
- `toUsd(amount: bigint, tokenDecimals: number, tokenPriceUsd: number): number`

### Pagination (src/utils/pagination.ts)
- `parsePagination(query: { page?, limit? }): { skip: number, take: number }`
- `buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta`
- Default limit: 20, max limit: 100

### Crypto (src/utils/crypto.ts)
- `generateToken(bytes: number = 32): string` — cryptographically random hex string
- `hashToken(token: string): string` — SHA-256 hash
- `generateApiKey(): { key: string, prefix: string, hash: string }` — full API key generation

---

## Server Initialization (src/server.ts)

Fastify server setup in this exact order:
1. Create Fastify instance with logger (Pino)
2. Register requestId middleware
3. Register CORS plugin (@fastify/cors) with configured origins
4. Register rate limiter middleware (global)
5. Register auth middleware (available but not applied globally)
6. Register WebSocket plugin (@fastify/websocket)
7. Register all route files from src/routes/
8. Set error handler (errorHandler middleware)
9. Add health check endpoint: `GET /health` → returns { status: 'ok', timestamp, uptime }
10. Start listening on configured PORT
11. Register graceful shutdown handlers (SIGINT, SIGTERM): close server, disconnect db, disconnect redis

---

## Test Specifications for Foundation

| # | Test | Input | Expected | Validates |
|---|---|---|---|---|
| 1 | Config loads with valid env | All required env vars set | Config object returned | Happy path |
| 2 | Config fails with missing DATABASE_URL | Missing DATABASE_URL | Process exits with clear error | Required var validation |
| 3 | Config fails with invalid PORT | PORT="abc" | Zod error: expected number | Type validation |
| 4 | Logger redacts password field | Log { email, password } | password replaced with [REDACTED] | Sensitive data redaction |
| 5 | Auth middleware accepts valid JWT | Valid Bearer token | request.user populated | JWT verification |
| 6 | Auth middleware rejects expired JWT | Expired token | 401 UNAUTHORIZED | Expiry check |
| 7 | Auth middleware rejects missing header | No Authorization header | 401 UNAUTHORIZED | Missing auth |
| 8 | Rate limiter blocks excess requests | 31 requests in 1 min (monitor tier) | 31st returns 429 | Rate limiting |
| 9 | Error handler formats AppError | Throw NotFoundError | 404 response with code NOT_FOUND | Error formatting |
| 10 | Error handler formats unknown error | Throw new Error("bug") | 500 INTERNAL_ERROR, no stack in response | Error safety |
| 11 | Health check returns OK | GET /health | 200 { status: 'ok' } | Server alive |
| 12 | BigNumber sqrt | sqrt(4n) | 2n | Math utility |
| 13 | Address checksum | "0xabc..." lowercase | EIP-55 checksummed | Address utility |
| 14 | Pagination defaults | {} | { skip: 0, take: 20 } | Pagination defaults |
| 15 | Pagination max limit | { limit: 500 } | { skip: 0, take: 100 } | Limit cap |
