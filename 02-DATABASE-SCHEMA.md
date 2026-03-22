# Database Schema: FlashRoute

---

## Overview

FlashRoute's database stores user accounts, subscription data, strategy configurations, trade execution history, pool metadata, analytics aggregates, and system configuration. The real-time operational data (pool reserves, pending transactions, graph state) lives in Redis — PostgreSQL handles persistence, analytics, and the SaaS platform data.

**Total tables:** 18
**Naming conventions:** snake_case for tables and columns, UUID primary keys (except blockchain-native tables which use address/hash as PK), `created_at` + `updated_at` timestamps on all tables, soft delete via `deleted_at` where applicable.

---

## User & Auth Tables

### Table: users
**Purpose:** All user accounts — both dashboard SaaS users and bot operators.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique identifier |
| email | VARCHAR(255) | UNIQUE NOT NULL | — | Login email (stored lowercase, trimmed) |
| password_hash | VARCHAR(255) | NOT NULL | — | bcrypt hash, cost factor 12 |
| name | VARCHAR(100) | NOT NULL | — | Display name |
| role | VARCHAR(20) | NOT NULL | 'monitor' | Tier: monitor, trader, executor, institutional, admin |
| email_verified | BOOLEAN | NOT NULL | false | Email verification status |
| email_verified_at | TIMESTAMP | NULLABLE | NULL | When email was verified |
| stripe_customer_id | VARCHAR(255) | NULLABLE INDEXED | NULL | Stripe customer link |
| avatar_url | VARCHAR(500) | NULLABLE | NULL | Profile image URL |
| timezone | VARCHAR(50) | NOT NULL | 'UTC' | IANA timezone for display |
| last_login_at | TIMESTAMP | NULLABLE | NULL | Most recent successful login |
| login_count | INTEGER | NOT NULL | 0 | Total successful logins |
| failed_login_count | INTEGER | NOT NULL | 0 | Consecutive failed login attempts |
| locked_until | TIMESTAMP | NULLABLE | NULL | Account lockout expiry |
| two_factor_enabled | BOOLEAN | NOT NULL | false | TOTP 2FA active |
| two_factor_secret | VARCHAR(255) | NULLABLE | NULL | Encrypted TOTP secret |
| notification_preferences | JSONB | NOT NULL | '{}' | Alert channels and thresholds |
| created_at | TIMESTAMP | NOT NULL | NOW() | Record creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last update |
| deleted_at | TIMESTAMP | NULLABLE | NULL | Soft delete |

**Indexes:**
- UNIQUE on `email` (case-insensitive)
- INDEX on `stripe_customer_id`
- INDEX on `role`
- INDEX on `created_at`

**Relationships:**
- HAS MANY `refresh_tokens` (CASCADE DELETE)
- HAS MANY `api_keys` (CASCADE DELETE)
- HAS ONE `subscription` (CASCADE DELETE)
- HAS MANY `strategies` (CASCADE DELETE)
- HAS MANY `alerts` (CASCADE DELETE)

---

### Table: refresh_tokens
**Purpose:** JWT refresh token storage with rotation tracking.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → users.id NOT NULL | — | Owner |
| token_hash | VARCHAR(255) | UNIQUE NOT NULL | — | SHA-256 hash of refresh token |
| family_id | UUID | NOT NULL | gen_random_uuid() | Token family for rotation detection |
| expires_at | TIMESTAMP | NOT NULL | — | Expiry (7 days from creation) |
| revoked_at | TIMESTAMP | NULLABLE | NULL | When revoked (logout or rotation) |
| replaced_by | UUID | NULLABLE FK → refresh_tokens.id | NULL | The token that replaced this one |
| ip_address | VARCHAR(45) | NULLABLE | NULL | IP at time of issuance |
| user_agent | VARCHAR(500) | NULLABLE | NULL | Browser/client user agent |
| created_at | TIMESTAMP | NOT NULL | NOW() | Token creation time |

**Indexes:**
- UNIQUE on `token_hash`
- INDEX on `user_id`
- INDEX on `family_id`
- INDEX on `expires_at`

---

### Table: api_keys
**Purpose:** API key management for programmatic access (SaaS users).

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → users.id NOT NULL | — | Owner |
| name | VARCHAR(100) | NOT NULL | — | User-defined label (e.g., "Production Bot") |
| key_prefix | VARCHAR(8) | NOT NULL | — | First 8 chars of key (for identification) |
| key_hash | VARCHAR(255) | UNIQUE NOT NULL | — | SHA-256 hash of full key |
| permissions | JSONB | NOT NULL | '["read"]' | Array of permission strings |
| rate_limit_per_minute | INTEGER | NOT NULL | 60 | Custom rate limit for this key |
| last_used_at | TIMESTAMP | NULLABLE | NULL | Most recent API call with this key |
| expires_at | TIMESTAMP | NULLABLE | NULL | Optional expiry date |
| revoked_at | TIMESTAMP | NULLABLE | NULL | When manually revoked |
| created_at | TIMESTAMP | NOT NULL | NOW() | Key creation time |

**Indexes:**
- UNIQUE on `key_hash`
- INDEX on `user_id`
- INDEX on `key_prefix`

---

### Table: subscriptions
**Purpose:** Stripe subscription tracking for SaaS tiers.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique identifier |
| user_id | UUID | FK → users.id UNIQUE NOT NULL | — | One subscription per user |
| stripe_subscription_id | VARCHAR(255) | UNIQUE NOT NULL | — | Stripe sub ID |
| stripe_price_id | VARCHAR(255) | NOT NULL | — | Current price/plan ID |
| plan | VARCHAR(20) | NOT NULL | 'monitor' | monitor, trader, executor, institutional |
| status | VARCHAR(20) | NOT NULL | 'active' | active, past_due, cancelled, trialing |
| current_period_start | TIMESTAMP | NOT NULL | — | Billing period start |
| current_period_end | TIMESTAMP | NOT NULL | — | Billing period end |
| cancel_at_period_end | BOOLEAN | NOT NULL | false | Will cancel at period end |
| trial_end | TIMESTAMP | NULLABLE | NULL | Trial period end |
| created_at | TIMESTAMP | NOT NULL | NOW() | Subscription creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last update |

**Indexes:**
- UNIQUE on `user_id`
- UNIQUE on `stripe_subscription_id`
- INDEX on `plan`
- INDEX on `status`

---

## Blockchain Data Tables

### Table: supported_chains
**Purpose:** Chain configuration — which blockchain networks the system operates on.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | SERIAL | PRIMARY KEY | auto | Chain config ID |
| chain_id | INTEGER | UNIQUE NOT NULL | — | EVM chain ID (1=Ethereum, 42161=Arbitrum, 8453=Base, 10=Optimism) |
| name | VARCHAR(50) | NOT NULL | — | Human-readable name |
| rpc_url | VARCHAR(500) | NOT NULL | — | Primary RPC endpoint |
| ws_url | VARCHAR(500) | NOT NULL | — | WebSocket endpoint |
| flashbots_relay_url | VARCHAR(500) | NULLABLE | NULL | Flashbots relay (null if not supported) |
| block_time_ms | INTEGER | NOT NULL | 12000 | Average block time in milliseconds |
| native_token_symbol | VARCHAR(10) | NOT NULL | 'ETH' | Native gas token symbol |
| explorer_url | VARCHAR(500) | NOT NULL | — | Block explorer base URL |
| is_active | BOOLEAN | NOT NULL | true | Whether bot is active on this chain |
| executor_contract_address | VARCHAR(42) | NULLABLE | NULL | Deployed FlashRouteExecutor address |
| created_at | TIMESTAMP | NOT NULL | NOW() | Record creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last update |

---

### Table: tokens
**Purpose:** Token registry — all tokens the system trades.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Internal ID |
| chain_id | INTEGER | FK → supported_chains.chain_id NOT NULL | — | Which chain |
| address | VARCHAR(42) | NOT NULL | — | Token contract address (checksummed) |
| symbol | VARCHAR(20) | NOT NULL | — | Token symbol (ETH, USDC, etc.) |
| name | VARCHAR(100) | NOT NULL | — | Full token name |
| decimals | SMALLINT | NOT NULL | — | Token decimals (6 for USDC, 18 for ETH, etc.) |
| is_stablecoin | BOOLEAN | NOT NULL | false | Whether this is a stablecoin |
| is_blacklisted | BOOLEAN | NOT NULL | false | Transfer-tax tokens, honeypots, etc. |
| blacklist_reason | VARCHAR(255) | NULLABLE | NULL | Why blacklisted |
| coingecko_id | VARCHAR(100) | NULLABLE | NULL | CoinGecko identifier for price data |
| logo_url | VARCHAR(500) | NULLABLE | NULL | Token logo for dashboard display |
| created_at | TIMESTAMP | NOT NULL | NOW() | First seen |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last metadata update |

**Indexes:**
- UNIQUE on `(chain_id, address)` (one entry per token per chain)
- INDEX on `symbol`
- INDEX on `is_blacklisted`

---

### Table: pools
**Purpose:** DEX pool registry — all pools the system monitors.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Internal ID |
| chain_id | INTEGER | FK → supported_chains.chain_id NOT NULL | — | Which chain |
| address | VARCHAR(42) | NOT NULL | — | Pool contract address |
| dex | VARCHAR(30) | NOT NULL | — | DEX name: uniswap_v2, uniswap_v3, sushiswap, curve, balancer |
| dex_version | VARCHAR(10) | NOT NULL | — | Protocol version (v2, v3, stable, weighted) |
| token0_id | UUID | FK → tokens.id NOT NULL | — | First token in pair |
| token1_id | UUID | FK → tokens.id NOT NULL | — | Second token in pair |
| fee_bps | INTEGER | NOT NULL | — | Pool fee in basis points (30 = 0.3%) |
| tvl_usd | DECIMAL(20,2) | NOT NULL | 0 | Total value locked in USD |
| volume_24h_usd | DECIMAL(20,2) | NOT NULL | 0 | 24-hour trading volume in USD |
| is_active | BOOLEAN | NOT NULL | true | Whether pool is included in graph |
| min_tvl_threshold | DECIMAL(20,2) | NOT NULL | 10000 | Minimum TVL to be included ($10K default) |
| extra_data | JSONB | NOT NULL | '{}' | DEX-specific: tick spacing (V3), amplification (Curve), weights (Balancer) |
| last_synced_at | TIMESTAMP | NULLABLE | NULL | Last time reserves were fetched |
| created_at | TIMESTAMP | NOT NULL | NOW() | First seen |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last update |

**Indexes:**
- UNIQUE on `(chain_id, address)`
- INDEX on `dex`
- INDEX on `(token0_id, token1_id)`
- INDEX on `is_active`
- INDEX on `tvl_usd`

---

## Strategy & Execution Tables

### Table: strategies
**Purpose:** User-configured arbitrage strategies with parameters and activation status.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Strategy ID |
| user_id | UUID | FK → users.id NOT NULL | — | Owner |
| name | VARCHAR(100) | NOT NULL | — | User-defined name |
| chain_id | INTEGER | FK → supported_chains.chain_id NOT NULL | — | Target chain |
| is_active | BOOLEAN | NOT NULL | false | Whether strategy is running |
| min_profit_usd | DECIMAL(10,2) | NOT NULL | 10.00 | Minimum profit threshold in USD |
| max_trade_size_usd | DECIMAL(14,2) | NOT NULL | 100000.00 | Maximum flash loan size in USD |
| max_hops | SMALLINT | NOT NULL | 4 | Maximum swap hops in a route (2-6) |
| allowed_dexes | JSONB | NOT NULL | '["uniswap_v2","uniswap_v3","sushiswap","curve","balancer"]' | Which DEXes to include |
| allowed_tokens | JSONB | NULLABLE | NULL | Token whitelist (null = all non-blacklisted) |
| blocked_tokens | JSONB | NOT NULL | '[]' | Token blacklist (user-specific) |
| flash_loan_provider | VARCHAR(20) | NOT NULL | 'auto' | auto, aave, balancer, dydx |
| use_flashbots | BOOLEAN | NOT NULL | true | Submit via Flashbots (private) or public mempool |
| max_gas_price_gwei | DECIMAL(10,2) | NOT NULL | 100.00 | Abort if gas exceeds this |
| risk_buffer_pct | DECIMAL(5,2) | NOT NULL | 0.50 | Risk buffer as % of trade amount |
| use_demand_prediction | BOOLEAN | NOT NULL | true | Enable mempool-based demand prediction |
| execution_count | INTEGER | NOT NULL | 0 | Total executions with this strategy |
| total_profit_usd | DECIMAL(14,2) | NOT NULL | 0 | Lifetime profit from this strategy |
| created_at | TIMESTAMP | NOT NULL | NOW() | Strategy creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last modification |

**Indexes:**
- INDEX on `user_id`
- INDEX on `chain_id`
- INDEX on `is_active`

---

### Table: trades
**Purpose:** Every arbitrage execution — successful or failed. The core analytics table.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Trade ID |
| strategy_id | UUID | FK → strategies.id NOT NULL | — | Which strategy triggered this |
| user_id | UUID | FK → users.id NOT NULL | — | Owner (denormalized for query perf) |
| chain_id | INTEGER | FK → supported_chains.chain_id NOT NULL | — | Execution chain |
| status | VARCHAR(20) | NOT NULL | 'pending' | pending, submitted, included, confirmed, reverted, failed |
| tx_hash | VARCHAR(66) | NULLABLE INDEXED | NULL | Transaction hash (null if not yet submitted) |
| block_number | BIGINT | NULLABLE | NULL | Block containing the transaction |
| route_path | JSONB | NOT NULL | — | Array of {pool, tokenIn, tokenOut, dex} |
| route_hops | SMALLINT | NOT NULL | — | Number of hops in route |
| flash_loan_provider | VARCHAR(20) | NOT NULL | — | aave, balancer, dydx |
| flash_loan_token | VARCHAR(42) | NOT NULL | — | Token address borrowed |
| flash_loan_amount | DECIMAL(30,0) | NOT NULL | — | Amount borrowed (raw, no decimals) |
| flash_loan_fee | DECIMAL(30,0) | NOT NULL | — | Fee paid (raw) |
| profit_raw | DECIMAL(30,0) | NULLABLE | NULL | Profit in flash_loan_token (raw) |
| profit_usd | DECIMAL(14,4) | NULLABLE | NULL | Profit converted to USD |
| gas_used | BIGINT | NULLABLE | NULL | Gas consumed |
| gas_price_gwei | DECIMAL(10,4) | NULLABLE | NULL | Effective gas price |
| gas_cost_usd | DECIMAL(10,4) | NULLABLE | NULL | Gas cost in USD |
| net_profit_usd | DECIMAL(14,4) | NULLABLE | NULL | profit_usd - gas_cost_usd - flash_loan_fee_usd |
| simulated_profit_usd | DECIMAL(14,4) | NOT NULL | — | Expected profit from simulation |
| slippage_pct | DECIMAL(6,4) | NULLABLE | NULL | Actual vs simulated slippage |
| demand_prediction_used | BOOLEAN | NOT NULL | false | Whether demand prediction influenced this trade |
| competing_txs_in_block | INTEGER | NULLABLE | NULL | Number of competing arb txs in same block |
| error_message | TEXT | NULLABLE | NULL | Error details if failed/reverted |
| execution_time_ms | INTEGER | NOT NULL | — | Time from discovery to submission |
| submitted_at | TIMESTAMP | NULLABLE | NULL | When tx was submitted |
| confirmed_at | TIMESTAMP | NULLABLE | NULL | When tx was confirmed |
| created_at | TIMESTAMP | NOT NULL | NOW() | Discovery time |

**Indexes:**
- INDEX on `strategy_id`
- INDEX on `user_id`
- INDEX on `chain_id`
- INDEX on `status`
- INDEX on `tx_hash` (UNIQUE where NOT NULL)
- INDEX on `block_number`
- INDEX on `created_at` — primary sort for analytics
- COMPOSITE INDEX on `(user_id, created_at)` — user's trade history
- COMPOSITE INDEX on `(chain_id, status, created_at)` — chain-specific active trade queries

**Partitioning:** Partition by `created_at` (monthly) for query performance on large datasets.

---

### Table: trade_hops
**Purpose:** Individual swap hops within a trade — for detailed analytics per step.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Hop ID |
| trade_id | UUID | FK → trades.id NOT NULL | — | Parent trade |
| hop_index | SMALLINT | NOT NULL | — | Order in route (0, 1, 2, ...) |
| pool_id | UUID | FK → pools.id NOT NULL | — | Pool used |
| token_in_id | UUID | FK → tokens.id NOT NULL | — | Input token |
| token_out_id | UUID | FK → tokens.id NOT NULL | — | Output token |
| amount_in | DECIMAL(30,0) | NOT NULL | — | Input amount (raw) |
| amount_out | DECIMAL(30,0) | NOT NULL | — | Output amount (raw) |
| expected_amount_out | DECIMAL(30,0) | NOT NULL | — | Simulated output |
| slippage_pct | DECIMAL(6,4) | NULLABLE | NULL | Hop-level slippage |
| created_at | TIMESTAMP | NOT NULL | NOW() | Record creation |

**Indexes:**
- INDEX on `trade_id`
- COMPOSITE INDEX on `(trade_id, hop_index)`

---

## Analytics Tables

### Table: daily_analytics
**Purpose:** Pre-aggregated daily metrics per user per chain for dashboard performance.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Record ID |
| user_id | UUID | FK → users.id NOT NULL | — | Owner |
| chain_id | INTEGER | FK → supported_chains.chain_id NOT NULL | — | Chain |
| date | DATE | NOT NULL | — | Analytics date |
| total_trades | INTEGER | NOT NULL | 0 | Number of trades executed |
| successful_trades | INTEGER | NOT NULL | 0 | Trades that profited |
| failed_trades | INTEGER | NOT NULL | 0 | Reverted or failed trades |
| total_profit_usd | DECIMAL(14,4) | NOT NULL | 0 | Sum of net_profit_usd |
| total_gas_cost_usd | DECIMAL(14,4) | NOT NULL | 0 | Sum of gas costs |
| total_volume_usd | DECIMAL(18,4) | NOT NULL | 0 | Sum of flash loan amounts in USD |
| avg_profit_per_trade_usd | DECIMAL(10,4) | NOT NULL | 0 | Average net profit |
| max_profit_trade_usd | DECIMAL(14,4) | NOT NULL | 0 | Best single trade |
| avg_execution_time_ms | INTEGER | NOT NULL | 0 | Average discovery-to-submission time |
| most_profitable_route | JSONB | NULLABLE | NULL | Route path of best trade |
| demand_prediction_hit_rate | DECIMAL(5,2) | NULLABLE | NULL | % of prediction-based trades that profited |
| created_at | TIMESTAMP | NOT NULL | NOW() | Aggregation time |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last re-aggregation |

**Indexes:**
- UNIQUE on `(user_id, chain_id, date)`
- INDEX on `date`

---

### Table: pool_snapshots
**Purpose:** Periodic pool state snapshots for demand prediction training and historical analysis.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | auto | Record ID (BIGSERIAL for high volume) |
| pool_id | UUID | FK → pools.id NOT NULL | — | Pool reference |
| chain_id | INTEGER | NOT NULL | — | Chain (denormalized) |
| block_number | BIGINT | NOT NULL | — | Block at snapshot time |
| reserve0 | DECIMAL(30,0) | NOT NULL | — | Token0 reserve (raw) |
| reserve1 | DECIMAL(30,0) | NOT NULL | — | Token1 reserve (raw) |
| price_0_in_1 | DECIMAL(30,18) | NOT NULL | — | Derived price of token0 in terms of token1 |
| tvl_usd | DECIMAL(20,2) | NOT NULL | — | TVL at snapshot |
| created_at | TIMESTAMP | NOT NULL | NOW() | Snapshot time |

**Indexes:**
- INDEX on `(pool_id, block_number)`
- INDEX on `created_at`

**Retention:** Keep 30 days, then archive to cold storage. Automated cleanup job.

---

### Table: alerts
**Purpose:** User alert configurations and delivery tracking.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Alert ID |
| user_id | UUID | FK → users.id NOT NULL | — | Owner |
| type | VARCHAR(30) | NOT NULL | — | opportunity_found, trade_executed, trade_failed, profit_threshold, gas_spike, system_error |
| chain_id | INTEGER | FK → supported_chains.chain_id NULLABLE | NULL | Chain filter (null = all chains) |
| strategy_id | UUID | FK → strategies.id NULLABLE | NULL | Strategy filter (null = all strategies) |
| threshold_value | DECIMAL(14,4) | NULLABLE | NULL | Numeric threshold (e.g., min profit for alert) |
| delivery_channel | VARCHAR(20) | NOT NULL | 'dashboard' | dashboard, email, telegram, webhook |
| delivery_config | JSONB | NOT NULL | '{}' | Channel-specific config (webhook URL, telegram chat ID) |
| is_active | BOOLEAN | NOT NULL | true | Whether alert is enabled |
| last_triggered_at | TIMESTAMP | NULLABLE | NULL | Most recent trigger |
| trigger_count | INTEGER | NOT NULL | 0 | Lifetime triggers |
| cooldown_seconds | INTEGER | NOT NULL | 60 | Minimum seconds between triggers |
| created_at | TIMESTAMP | NOT NULL | NOW() | Alert creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last modification |

**Indexes:**
- INDEX on `user_id`
- INDEX on `(type, is_active)`

---

### Table: alert_history
**Purpose:** Record of every alert delivery for audit and debugging.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Record ID |
| alert_id | UUID | FK → alerts.id NOT NULL | — | Alert config that triggered this |
| user_id | UUID | NOT NULL | — | Owner (denormalized) |
| trade_id | UUID | FK → trades.id NULLABLE | NULL | Related trade (if applicable) |
| message | TEXT | NOT NULL | — | Alert message content |
| delivery_status | VARCHAR(20) | NOT NULL | 'pending' | pending, delivered, failed |
| delivered_at | TIMESTAMP | NULLABLE | NULL | When successfully delivered |
| error_message | TEXT | NULLABLE | NULL | Delivery error details |
| created_at | TIMESTAMP | NOT NULL | NOW() | Trigger time |

**Indexes:**
- INDEX on `alert_id`
- INDEX on `user_id`
- INDEX on `created_at`

---

### Table: competitor_activity
**Purpose:** Track competitor bot activity for competitive intelligence.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | auto | Record ID |
| chain_id | INTEGER | NOT NULL | — | Chain |
| block_number | BIGINT | NOT NULL | — | Block containing the competitor trade |
| tx_hash | VARCHAR(66) | NOT NULL | — | Competitor transaction hash |
| bot_address | VARCHAR(42) | NOT NULL | — | Competitor bot contract/EOA address |
| route_path | JSONB | NOT NULL | — | Detected arbitrage route |
| estimated_profit_usd | DECIMAL(14,4) | NULLABLE | NULL | Estimated profit |
| gas_used | BIGINT | NOT NULL | — | Gas consumed |
| gas_price_gwei | DECIMAL(10,4) | NOT NULL | — | Gas price paid |
| created_at | TIMESTAMP | NOT NULL | NOW() | Detection time |

**Indexes:**
- INDEX on `chain_id`
- INDEX on `bot_address`
- INDEX on `block_number`
- INDEX on `created_at`

**Retention:** Keep 30 days.

---

### Table: system_config
**Purpose:** Runtime system configuration — adjustable without redeployment.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | SERIAL | PRIMARY KEY | auto | Config ID |
| key | VARCHAR(100) | UNIQUE NOT NULL | — | Config key (e.g., 'global_min_profit_usd', 'max_concurrent_executions') |
| value | JSONB | NOT NULL | — | Config value (supports any JSON type) |
| description | TEXT | NOT NULL | — | Human-readable description |
| updated_by | UUID | FK → users.id NULLABLE | NULL | Last modifier (admin) |
| created_at | TIMESTAMP | NOT NULL | NOW() | Creation |
| updated_at | TIMESTAMP | NOT NULL | NOW() | Last modification |

---

### Table: audit_logs
**Purpose:** Security audit trail for all significant actions.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Log ID |
| user_id | UUID | FK → users.id NULLABLE | NULL | Acting user (null for system actions) |
| action | VARCHAR(50) | NOT NULL | — | e.g., 'strategy.create', 'trade.execute', 'config.update', 'user.login' |
| resource_type | VARCHAR(50) | NOT NULL | — | Entity type acted upon |
| resource_id | VARCHAR(100) | NULLABLE | NULL | Entity ID acted upon |
| details | JSONB | NOT NULL | '{}' | Additional context |
| ip_address | VARCHAR(45) | NULLABLE | NULL | Request IP |
| created_at | TIMESTAMP | NOT NULL | NOW() | Action time |

**Indexes:**
- INDEX on `user_id`
- INDEX on `action`
- INDEX on `created_at`

---

## Seed Data

### Development Environment
- 1 admin user: admin@flashroute.io / password: "AdminDev123!"
- 3 test users: one per paid tier (trader, executor, institutional)
- 2 supported chains: Ethereum (chain_id=1), Arbitrum (chain_id=42161)
- 20 sample tokens per chain (ETH, USDC, USDT, DAI, WBTC, WETH, UNI, LINK, AAVE, CRV, etc.)
- 50 sample pools across Uniswap V2, V3, SushiSwap, Curve
- 5 sample strategies with different parameters
- 100 sample trades with mixed statuses for dashboard testing

### Production Environment
- 1 admin user (created via CLI seed command)
- Supported chains configured via admin panel
- Tokens and pools auto-discovered by the Pool Indexer worker
- No sample data — all data is real from live execution

---

## Migration Strategy

- **Apply migrations:** `prisma migrate deploy` in CI/CD pipeline (GitHub Actions)
- **Development:** `prisma migrate dev` creates and applies in one step
- **Rollback:** Each migration has a corresponding down migration SQL file in `prisma/rollbacks/`
- **Breaking changes:** Multi-step migration — (1) add new column with default, (2) backfill data, (3) make non-null, (4) drop old column — never in one migration
- **Partitioning:** Applied via raw SQL migration for `trades` table (Prisma doesn't natively support partitioning)
