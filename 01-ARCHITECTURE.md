# Architecture: FlashRoute — Flash Loan Arbitrage Route Optimizer

---

## System Overview

FlashRoute is a real-time flash loan arbitrage system that discovers, simulates, and executes profitable arbitrage opportunities across decentralized exchanges. The system operates as both a direct income tool (autonomous bot executing trades for profit) and a SaaS dashboard (monitoring, analytics, and strategy management for subscribers).

### Component Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│  React Dashboard ←→ REST API + WebSocket (real-time updates)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│                         API GATEWAY                              │
│  Fastify Server — Auth, Rate Limiting, REST + WS endpoints       │
└────────────┬───────────────────┼──────────────┬─────────────────┘
             │                   │              │
┌────────────┴────────┐ ┌───────┴──────┐ ┌─────┴──────────────────┐
│   ANALYTICS ENGINE  │ │  EXECUTION   │ │   BACKGROUND WORKERS   │
│                     │ │   ENGINE     │ │                        │
│ • Graph Builder     │ │              │ │ • Pool State Indexer   │
│ • Route Discovery   │ │ • Flashbots  │ │ • Mempool Monitor      │
│ • Demand Predictor  │ │   Bundler    │ │ • Profit Sweeper       │
│ • Profit Simulator  │ │ • Flash Loan │ │ • Analytics Aggregator │
│                     │ │   Executor   │ │ • Competition Tracker  │
│                     │ │ • TX Manager │ │                        │
└─────────┬───────────┘ └──────┬───────┘ └──────────┬─────────────┘
          │                    │                     │
┌─────────┴────────────────────┴─────────────────────┴────────────┐
│                         DATA LAYER                               │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │PostgreSQL│  │  Redis   │  │ Ethereum │  │  Subgraphs /   │   │
│  │          │  │          │  │   Node   │  │  RPC Providers │   │
│  │History   │  │Pool State│  │ Mempool  │  │  Pool Data     │   │
│  │Analytics │  │Graph     │  │ Blocks   │  │  Token Data    │   │
│  │Configs   │  │Pending TX│  │ Receipts │  │                │   │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow — Primary Arbitrage Cycle

1. **Pool State Indexer** (background worker) continuously fetches pool reserves from Subgraphs and on-chain calls, writes to Redis
2. **Graph Builder** constructs weighted directed graph from Redis pool states
3. **Route Discovery** runs modified Bellman-Ford to find negative-weight cycles (profitable arbitrage paths)
4. **Mempool Monitor** (background worker) streams pending transactions, decodes DEX swaps, writes impact predictions to Redis
5. **Demand Predictor** reads pending tx impacts, projects future pool states, feeds updated states to Route Discovery
6. **Profit Simulator** takes candidate routes, simulates full execution path with gas estimation, ranks by net profit
7. **Execution Engine** receives the best route, constructs flash loan transaction, submits via Flashbots bundle API
8. **TX Manager** monitors bundle inclusion, records results to PostgreSQL
9. **Dashboard** displays real-time opportunities, execution history, profit analytics via WebSocket

---

## Tech Stack

### Backend

| Component | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | 22+ | Async I/O handles concurrent WebSocket streams efficiently; ethers.js/viem ecosystem is Node-native |
| Language | TypeScript | 5+ (strict) | Type safety is critical for financial calculations; strict mode catches edge cases at compile time |
| Framework | Fastify | 4+ | Lowest overhead Node.js framework; critical for latency-sensitive arbitrage operations; native WebSocket support via @fastify/websocket |
| Database | PostgreSQL | 16+ | JSONB for flexible trade logs; strong indexing for analytical queries; window functions for profit aggregation |
| ORM | Prisma | 5+ | Type-safe database access; migration management; but raw SQL used for performance-critical analytical queries |
| Cache | Redis | 7+ | Sub-millisecond reads for pool state cache; pub/sub for real-time event distribution between workers; sorted sets for pending tx priority queue |
| Queue | BullMQ | 4+ | Reliable job processing for non-latency-critical background tasks (analytics aggregation, report generation) |
| Blockchain | ethers.js | 6+ | Mature Ethereum library; ABI encoding/decoding, contract interaction, BigNumber arithmetic, wallet management |
| Blockchain (alt) | viem | 2+ | Used alongside ethers.js for performance-critical paths — faster ABI encoding, lower overhead |
| WebSocket | ws | 8+ | Raw WebSocket client for Ethereum node connection; lower overhead than socket.io for binary-heavy blockchain data |
| Payments | Stripe | Latest | SaaS subscription management for dashboard tiers |
| Validation | Zod | 3+ | Runtime validation for all API inputs, configuration, and decoded transaction data |
| Logging | Pino | 8+ | Structured JSON logging; critical for debugging arbitrage executions; minimal overhead |
| Testing | Jest + Supertest | Latest | Unit tests for algorithms, integration tests for API, mock providers for blockchain interactions |

### Frontend

| Component | Technology | Version | Justification |
|---|---|---|---|
| Framework | React | 18+ | Component model suits dashboard layout; hooks for WebSocket state management |
| Language | TypeScript | 5+ (strict) | Matches backend; type-safe API response handling |
| Build Tool | Vite | 5+ | Fast HMR for development; optimized production builds |
| Styling | Tailwind CSS | 3+ | Utility-first; rapid dashboard styling without CSS conflicts |
| State (Server) | TanStack Query v5 | Latest | Real-time polling + WebSocket cache invalidation for live data |
| State (Client) | Zustand | 4+ | WebSocket connection state, user preferences, active strategy selection |
| Routing | React Router | v6+ | Dashboard page navigation |
| Charts | Recharts | 2+ | Profit charts, gas analytics, route visualizations |
| Icons | Lucide React | Latest | Consistent iconography |
| Forms | React Hook Form + Zod | Latest | Strategy configuration forms, settings |
| Testing | Vitest + Testing Library | Latest | Component and integration tests |

### Infrastructure

| Component | Technology | Justification |
|---|---|---|
| Containerization | Docker + docker-compose | All services containerized; reproducible deployment |
| CI/CD | GitHub Actions | Automated testing, deployment to VPS |
| Hosting | Bare metal or dedicated VPS | Latency-critical — shared hosting adds unpredictable latency |
| Reverse Proxy | Nginx | SSL, WebSocket proxying, static assets |
| SSL | Let's Encrypt / Certbot | Free SSL |
| Process Manager | PM2 | Process management, auto-restart, cluster mode for API |
| Monitoring | Custom + Pino logs | Structured logs for profit tracking, error alerting via Telegram webhook |

### Blockchain Infrastructure

| Component | Specification | Justification |
|---|---|---|
| Ethereum Node | Geth or Erigon, full sync | Direct mempool access without API limits; lowest latency |
| RPC Providers | Alchemy + Infura (fallback) | Redundancy when own node has issues |
| Flashbots Relay | Flashbots Builder API | Private transaction submission; MEV protection |
| Block Explorer API | Etherscan API | Contract verification, ABI fetching, gas oracle |

---

## Component Architecture

### Service Dependency Graph

```
PoolStateService ←── SubgraphClient, RpcClient
       ↓
GraphBuilderService ←── PoolStateService (Redis)
       ↓
RouteDiscoveryService ←── GraphBuilderService
       ↓
MempoolMonitorService ←── EthereumNodeClient
       ↓
DemandPredictionService ←── MempoolMonitorService, PoolStateService
       ↓
ProfitSimulatorService ←── RouteDiscoveryService, DemandPredictionService, GasEstimatorService
       ↓
ExecutionEngineService ←── ProfitSimulatorService, FlashLoanProviderService, FlashbotsService
       ↓
TransactionManagerService ←── ExecutionEngineService, EthereumNodeClient
       ↓
AnalyticsService ←── TransactionManagerService (PostgreSQL)
```

### Shared Infrastructure

All services share:
- **Logger** (Pino): structured JSON, includes service name, correlation ID per arbitrage cycle
- **Redis Client**: connection pool, automatic reconnection, pub/sub channels for real-time events
- **Database Client** (Prisma): connection pool, query logging in development
- **Config System**: environment-based configuration with Zod validation
- **Error Classes**: typed error hierarchy (BlockchainError, SimulationError, ExecutionError, ValidationError)

### Event System

Inter-service communication uses Redis pub/sub for real-time events:

| Channel | Publisher | Subscribers | Payload |
|---|---|---|---|
| `pool:update` | PoolStateService | GraphBuilderService | `{ poolAddress, token0Reserve, token1Reserve, blockNumber }` |
| `route:discovered` | RouteDiscoveryService | ProfitSimulatorService, Dashboard WS | `{ routeId, path, estimatedProfit, confidence }` |
| `pending:swap` | MempoolMonitorService | DemandPredictionService | `{ txHash, dex, tokenIn, tokenOut, amountIn, pool }` |
| `demand:prediction` | DemandPredictionService | RouteDiscoveryService | `{ poolAddress, predictedReserves, confidence, blockTarget }` |
| `execution:result` | TransactionManagerService | AnalyticsService, Dashboard WS | `{ txHash, profit, gasUsed, route, status }` |
| `system:alert` | All services | AlertService, Dashboard WS | `{ severity, message, service, timestamp }` |

### Worker Process Architecture

The system runs as multiple processes for isolation and scalability:

| Process | Role | Concurrency |
|---|---|---|
| `api-server` | REST API + WebSocket server for dashboard | 1 (PM2 cluster: 2-4 instances) |
| `analytics-engine` | Graph builder + route discovery + profit simulation | 1 (single-threaded for state consistency) |
| `mempool-worker` | Mempool monitoring + pending tx decoding | 1 (dedicated WebSocket connection to node) |
| `pool-indexer` | Pool state fetching from subgraphs + on-chain | 1 (runs on configurable interval) |
| `executor` | Transaction construction + Flashbots submission | 1 (single-threaded to prevent nonce conflicts) |
| `jobs-worker` | BullMQ processor for background tasks | 1-2 (analytics aggregation, cleanup) |

---

## Security Architecture

### Authentication Flow

**Dashboard users (SaaS tier):**
1. Registration: email + password → bcrypt hash → store user → send verification email
2. Login: email + password → validate → issue JWT access token (15min) + refresh token (7 days, Redis)
3. Refresh: refresh token rotation — new access + new refresh on every refresh call; old refresh invalidated
4. Logout: revoke refresh token from Redis; access token expires naturally

**Bot operator (direct profit mode):**
- No dashboard auth needed — bot runs locally
- Private key for execution wallet stored in encrypted environment variable
- Execution wallet should be a HOT WALLET with minimal balance — profits auto-sweep to a COLD WALLET

### Authorization Model

| Role | Permissions | Resource Access |
|---|---|---|
| free (Monitor) | Read historical analytics, basic DEX monitoring | Own data only, 10 alerts/day |
| trader | Real-time alerts, demand prediction signals, backtesting | Own data + real-time feeds, 100 alerts/day |
| executor | Full automated execution, multi-chain, priority routing | Own data + execution engine, unlimited |
| institutional | Custom strategies, API access, dedicated resources | Everything + white-label |
| admin | System management, user management, all data | All resources |

### API Security Layers

- **Rate Limiting:** Per-tier limits enforced at Fastify middleware level; Redis-backed sliding window
- **Input Validation:** Zod schemas on every endpoint; reject before processing
- **CORS:** Dashboard origin only; API key endpoints accept any origin (authenticated by key)
- **Secrets Management:** Environment variables for all secrets; never in code or config files
- **Wallet Security:** Private key encrypted at rest; execution wallet holds minimum balance; auto-sweep profits to cold wallet every N blocks

### Smart Contract Security

- **Reentrancy Guard:** `nonReentrant` modifier on all external-facing functions
- **Access Control:** Only the owner address can trigger execution; no public functions that move funds
- **Profit Check:** Final balance check before completing flash loan repayment — revert if not profitable
- **Emergency Withdraw:** Owner-only function to recover any stuck tokens
- **No Upgradability:** Immutable contract — no proxy pattern, no delegatecall. Deploy new version if changes needed.

---

## Scalability Design

### At Current Scale (Solo Operator)

Single VPS handles everything:
- One Ethereum node (or RPC provider)
- One analytics engine process
- One executor process
- Dashboard serves 1-5 concurrent users
- PostgreSQL and Redis on same machine

### At 100 SaaS Users

- **API server:** PM2 cluster mode with 4 workers behind Nginx load balancer
- **Analytics engine:** Still single process but with Redis pub/sub distributing alerts to multiple subscribers
- **Database:** Add read replicas for analytics queries; write queries go to primary
- **Redis:** Increase memory; separate instances for cache vs. pub/sub if needed

### At 1,000+ SaaS Users

- **API server:** Horizontal scaling across multiple VPS instances behind a load balancer
- **Analytics engine:** Shard by chain — one process per supported chain (Ethereum, Arbitrum, Base, Optimism)
- **Execution engine:** One executor per chain; each with its own wallet and nonce management
- **Database:** Partition trades table by date; archive old data to cold storage
- **WebSocket:** Dedicated WebSocket server(s) with Redis adapter for cross-server message broadcasting

### Database Scaling Strategy

- **Connection Pooling:** PgBouncer in front of PostgreSQL; 20 connections per pool
- **Partitioning:** `trades` table partitioned by `executed_at` (monthly partitions)
- **Indexes:** Composite indexes on frequently queried columns (strategy_id + executed_at, chain_id + status)
- **Archival:** Trades older than 90 days moved to `trades_archive` table; queryable but not in hot path

### Caching Strategy

| Data | Cache Location | TTL | Invalidation |
|---|---|---|---|
| Pool reserves | Redis hash per pool | 12 seconds (1 block) | On new block event |
| Token metadata (decimals, symbol) | Redis hash | 24 hours | Never (immutable on-chain) |
| Gas estimates | Redis key | 12 seconds | On new block event |
| Route discovery results | Redis sorted set | 6 seconds (half block) | On new route discovery cycle |
| User session data | Redis hash | 15 minutes (access token TTL) | On logout/token refresh |
| Dashboard analytics | Redis hash | 60 seconds | On new analytics aggregation |

---

## Technology Decision Log

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Backend framework | Fastify | Express, Hono, Koa | Lowest overhead for latency-sensitive operations; native validation with JSON Schema; WebSocket support |
| Blockchain library | ethers.js + viem | web3.js | ethers.js has better TypeScript support and is more maintained; viem added for performance-critical ABI encoding paths |
| Database | PostgreSQL | MongoDB, ClickHouse | Relational model suits trade records, user data, config; JSONB for flexible metadata; strong analytical query support |
| Cache | Redis | Memcached | Pub/sub needed for inter-process events; sorted sets for priority queues; persistence for crash recovery |
| Queue | BullMQ | Bee-Queue, Agenda | Redis-based (shares infrastructure); reliable delayed jobs; repeatable jobs for scheduled tasks |
| Smart contract lang | Solidity | Vyper | Broader ecosystem; more DEX interface examples; better tooling (Hardhat, Foundry) |
| Process architecture | Multi-process | Single process, Microservices | Multi-process gives isolation without network overhead; shared Redis for communication; simpler deployment than microservices |
| MEV submission | Flashbots | Direct mempool, MEV Blocker | Private submission prevents frontrunning; bundle atomicity; builder network coverage |
| Charting | Recharts | Chart.js, D3, Nivo | React-native; sufficient for dashboard charts; good TypeScript support |
| WebSocket server | @fastify/websocket | socket.io | Lower overhead; no fallback protocols needed (all modern browsers support WS); matches Fastify stack |

---

## Smart Contract Architecture

The on-chain component is a single executor contract that:

1. **Receives flash loan callback** (from Aave, Balancer, or dYdX)
2. **Executes swap sequence** encoded in calldata
3. **Checks profit** (final balance > borrowed + fee + minimum profit)
4. **Repays flash loan** (or reverts if unprofitable)

### Contract Interface

```
FlashRouteExecutor
├── executeArbitrage(params: ArbitrageParams) — owner only, triggers flash loan
├── onFlashLoan(...)  — Aave V3 callback
├── receiveFlashLoan(...)  — Balancer callback  
├── callFunction(...)  — dYdX callback
├── sweepProfits(token, to, amount) — owner only, withdraw profits
├── emergencyWithdraw(token) — owner only, recover stuck tokens
└── receive() — accept ETH
```

### Calldata Encoding

Swap sequences are encoded as a packed byte array for gas efficiency:
```
[swap_count: uint8]
[swap_0: {dex_type: uint8, pool: address, tokenIn: address, tokenOut: address, amountIn: uint256}]
[swap_1: {dex_type: uint8, pool: address, tokenIn: address, tokenOut: address, amountIn: uint256}]
...
```

`dex_type` enum: 0 = Uniswap V2, 1 = Uniswap V3, 2 = Curve, 3 = Balancer, 4 = SushiSwap

This packed encoding saves ~40% gas compared to ABI-encoded struct arrays.


---

## Runtime Boundaries, Failure Domains, and Latency Budget

FlashRoute cannot be structured like a generic SaaS backend because the arbitrage loop has a hard latency envelope. The useful life of an opportunity is usually one block on L1 and often materially less on L2s with fast sequencer inclusion. The architecture therefore divides components into **hot-path**, **warm-path**, and **cold-path** responsibilities.

### Hot path

The hot path includes any component whose output directly influences whether a transaction is submitted for inclusion:

1. pool state ingestion from new blocks and relevant logs,
2. graph edge recalculation,
3. cycle discovery,
4. profit simulation,
5. bundle submission,
6. receipt tracking for immediate post-trade accounting.

These components must stay resident in memory, avoid database round-trips where possible, and treat PostgreSQL as a persistence sink rather than the source of truth for current execution state. Redis and process memory hold the authoritative near-real-time view; PostgreSQL stores the durable record. This distinction is not optional. If the executor waits on relational joins to decide whether a route is profitable, the opportunity will already be stale.

### Warm path

Warm-path components enrich the hot path but are not required for basic operation:

- mempool decoding and demand prediction,
- dynamic gas heuristics,
- competitor profiling,
- dashboard websocket fanout,
- subscription feature gating.

If these fail, the system must degrade to direct state-based arbitrage rather than halt. That means every service contract should distinguish between `requiredForExecution=true` and `bestEffort=true` dependencies. For example, failure to fetch Stripe subscription data must never block a running executor process; it only affects dashboard permissions and account state transitions.

### Cold path

Cold-path workloads include aggregation, archival, reporting, email delivery, and admin analytics. These should be isolated in BullMQ workers with bounded concurrency. They may lag by minutes without affecting trading correctness.

### Latency budget per opportunity

A useful implementation target for Ethereum mainnet is:

| Stage | Target budget |
|---|---:|
| Pool/event ingestion and cache write | 20-40 ms |
| Graph incremental update | 10-25 ms |
| Cycle search on relevant token subset | 30-80 ms |
| Profit simulation + amount optimization | 50-120 ms |
| Flashbots bundle build + sign | 10-20 ms |
| Relay submission | 20-60 ms |
| Total | 140-345 ms |

The coding agent should optimize around these budgets. If an implementation choice obviously violates them, it is the wrong choice even if it is architecturally elegant.

## Process Separation and Inter-Process Contracts

Each worker is its own failure domain. A crash in the mempool worker must not bring down API auth; a Stripe webhook spike must not starve pool indexing CPU. Communication happens through Redis pub/sub for ephemeral events and Redis keys/hashes/sorted sets for short-lived shared state.

### Required Redis channels

- `fr:pool:update` — emitted after reserve-changing block events and full sync writes.
- `fr:route:discovered` — emitted when a route clears preliminary profitability thresholds.
- `fr:execution:submitted` — emitted immediately after a bundle is accepted by relay or tx is broadcast.
- `fr:execution:result` — emitted after confirmation, failure, expiry, or replacement.
- `fr:demand:prediction` — emitted when projected state changes reach confidence threshold.
- `fr:config:changed` — emitted after admin config mutation so long-lived workers can hot-reload.
- `fr:system:alert` — emitted for degraded node health, stuck queues, repeated execution failures, and low gas balance.

### Message contract rules

Every Redis event payload must include:

- `eventId` (UUIDv7),
- `eventType`,
- `emittedAt` ISO timestamp,
- `chainId`, if chain-specific,
- `correlationId`, propagated from discovery through execution where possible,
- `version`, starting at 1 for forward-compatible payload evolution.

Pub/sub delivery is lossy; consumers therefore cannot rely on events alone for correctness. Any state needed after process restart must also exist in a recoverable key or database row. Example: discovered routes may be published to `fr:route:discovered`, but the executor should additionally read a Redis sorted set of recent route candidates keyed by score so it can recover after restart.

## Data Ownership Model

Ownership rules prevent race conditions and “last writer wins” corruption.

- **Pools table / token registry**: canonical in PostgreSQL; read-mostly in workers.
- **Current pool state**: canonical in Redis because it is block-scoped and ephemeral.
- **Execution locks and nonces**: canonical in Redis, persisted to PostgreSQL only for audit/debug.
- **Trade records and strategy config**: canonical in PostgreSQL.
- **Mempool projections**: canonical in Redis with short TTL.
- **Subscription and billing state**: canonical in PostgreSQL, derived from Stripe events.

A worker may only directly mutate the canonical store for the entities it owns. For example, the analytics engine can update Redis pool state and enqueue a DB reconciliation job, but it should not mutate subscription status. The billing service owns subscription mutations. This is the key architectural control that keeps the codebase understandable.

## Chain Abstraction Without False Uniformity

The product is multi-chain, but not every chain behaves the same. The architecture should expose a `ChainAdapter` interface with common methods such as `getBlockWithLogs`, `multicall`, `getBaseFeeHint`, `supportsFlashbotsLikeSubmission`, and `finalityHeuristic`. Under that interface, each chain may implement materially different behavior.

Examples:

- Ethereum mainnet supports private relay submission and has highly adversarial competition.
- Arbitrum has different gas accounting and faster confirmation loops.
- Polygon may require wider slippage and RPC fallback protections because node quality is less consistent.
- Base may have cheaper gas, changing the minimum viable profit threshold.

Do not flatten these differences away. The architecture should centralize shared interfaces but permit chain-specific heuristics in configuration and service implementations.

## Security and Operational Guardrails

The dashboard SaaS and the trading engine share data but not trust levels. API-facing code runs on the public internet; executor code handles keys and signs profitable transactions. They must not share the same environment surface.

Minimum separation requirements:

1. Executor private keys live only in executor worker environment, never in API containers.
2. Stripe webhook secret, JWT secrets, and API key pepper are separate secrets with separate rotation procedures.
3. Admin impersonation tokens are marked with `impersonatedBy` claim and rejected by execution routes.
4. Public APIs may read aggregated trade history but never expose raw wallet addresses of internal execution accounts unless user-owned and explicitly allowed.
5. Maintenance mode disables strategy activation and execution submission, but still permits read-only admin health routes.

### Recovery posture

On restart, the system must rebuild volatile state in this order:

1. connect Redis and PostgreSQL,
2. load chain configs and active strategies,
3. full pool sync,
4. graph rebuild,
5. resubscribe to new blocks and pending tx streams,
6. reconcile any `submitted` trades without final receipt,
7. reopen websocket streams for dashboards.

This startup order matters because route discovery without fresh pool state is worse than being offline; it produces false positives that waste gas.
