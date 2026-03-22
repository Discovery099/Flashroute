# Deployment & Infrastructure Specification: FlashRoute

---

## Objective

FlashRoute is both a latency-sensitive arbitrage platform and a SaaS dashboard. Deployment therefore has to support two operating modes:

1. **Single-operator mode** for the founder or advanced user running direct execution and monitoring
2. **Multi-user SaaS mode** serving dashboard customers, subscriptions, alerts, and admin tooling

This document specifies the runtime topology, service decomposition, environment layout, deployment pipeline, secret handling, observability, rollback, and chain-facing operational safeguards.

**Estimated implementation LOC / infra config output:** 5,000–8,000 across Dockerfiles, compose files, PM2 ecosystem config, GitHub Actions workflows, Nginx config, provisioning scripts, backup scripts, and operational docs.

---

## Deployment Principles

1. **Deterministic environments** — local, staging, and production should use the same service graph with environment-specific sizing.
2. **Fail closed for execution** — if critical dependencies degrade, automated execution pauses before it guesses.
3. **Separate hot path from support path** — execution and analytics workers must not compete with marketing page traffic or admin screens for resources.
4. **Self-host where latency matters** — own node or dedicated low-latency RPC is preferred for mempool and execution paths.
5. **Simple over clever** — a single solid VPS deployment is better than premature Kubernetes complexity at this stage.

---

## Environment Topology

### Local Development

Services:
- `frontend` (Vite dev server)
- `api` (Fastify)
- `postgres`
- `redis`
- optional `mailhog` or mock email service
- optional blockchain RPC stubs / forked chain environment for contract testing

Purpose:
- full-stack feature development
- UI and API integration
- state and billing workflow testing
- non-production execution simulation

### Staging

Services:
- `nginx`
- `frontend` static build served through Nginx
- `api`
- `analytics-engine`
- `pool-indexer`
- `mempool-worker` against non-production or limited feeds
- `jobs-worker`
- `postgres`
- `redis`

Purpose:
- pre-production validation
- deploy verification
- UI acceptance
- contract/API compatibility checks
- subscription and auth testing

### Production

Recommended first production layout:
- dedicated VPS or bare metal host in low-latency region
- Dockerized services with process isolation
- Nginx reverse proxy
- PostgreSQL 16+
- Redis 7+
- API container(s)
- analytics worker
- pool indexer worker
- mempool worker
- executor worker
- jobs worker
- optional watcher/alert sidecar

If traffic grows, split production into two machines:
- **Machine A:** API + frontend + billing/admin + PostgreSQL + Redis
- **Machine B:** chain-facing analytics + mempool + executor workers + own node or node client

---

## Service Inventory

| Service | Responsibility | Criticality |
|---|---|---|
| `frontend` | React app static assets | Medium |
| `api` | REST + WS + auth + billing + admin | Critical |
| `analytics-engine` | route discovery, scoring, simulation orchestration | Critical |
| `pool-indexer` | reserve and pool metadata refresh | Critical |
| `mempool-worker` | pending tx ingestion and decoding | Critical |
| `executor` | transaction construction and private submission | Critical |
| `jobs-worker` | reports, aggregations, cleanup, alerts | High |
| `postgres` | persistent system of record | Critical |
| `redis` | cache, queue, pub/sub, rate limits | Critical |
| `nginx` | TLS termination, reverse proxy, static files | High |
| `node/rpc` | chain data and mempool access | Critical |

Critical services participate in automated pause logic when unhealthy.

---

## Containerization Strategy

### Docker Images

Create separate images or multi-target builds for:
- frontend build image producing static assets
- API runtime image
- worker runtime image shared by analytics/indexer/mempool/executor/jobs with command-specific entrypoints

### Image Requirements

- Node.js 22 base image
- production dependencies only in runtime stages
- non-root user
- healthcheck command for API and workers where feasible
- environment variables injected at runtime, not baked into image
- small final image size through multi-stage builds

### Worker Entrypoints

Use one shared codebase and service-specific commands such as:
- `pnpm start:api`
- `pnpm start:worker:analytics`
- `pnpm start:worker:indexer`
- `pnpm start:worker:mempool`
- `pnpm start:worker:executor`
- `pnpm start:worker:jobs`

Do not run all worker roles in one container in production. That destroys restart isolation.

---

## Networking Model

### Public Endpoints

Expose only:
- HTTPS 443 via Nginx
- optional HTTP 80 redirecting to 443
- SSH locked down to specific IPs where possible

Do not expose:
- PostgreSQL
- Redis
- internal worker ports
- PM2 runtime ports
- private admin endpoints outside main app auth layer

### Internal Routing

Nginx routes:
- `/` → frontend static files
- `/api/` → API container
- `/ws` or equivalent → API WebSocket upgrade path

Workers communicate through internal Docker network and Redis pub/sub, never public internet unless talking to RPC/third-party services.

---

## Domain and TLS

Suggested domains:
- `app.flashroute.com` for authenticated app
- `www.flashroute.com` or root for marketing site
- optional `api.flashroute.com` if separating origins later

TLS:
- Let’s Encrypt / Certbot or automated ACME
- enforce HTTPS redirects
- modern TLS configuration only
- HSTS once domain stability is confirmed

WebSocket proxy requirements:
- proper `Upgrade` and `Connection` headers
- generous idle timeout to support live dashboards

---

## Environment Variables

### Shared Application Secrets
- `NODE_ENV`
- `APP_BASE_URL`
- `API_BASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECRET`
- `ENCRYPTION_KEY`

### Database / Cache
- `DATABASE_URL`
- `REDIS_URL`

### Auth / Email / Billing
- `RESEND_API_KEY` or SMTP credentials
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_*` per tier

### Blockchain / Execution
- `CHAIN_RPC_URL_ETHEREUM`
- `CHAIN_RPC_URL_ARBITRUM`
- `CHAIN_WS_URL_ETHEREUM`
- `CHAIN_WS_URL_ARBITRUM`
- `EXECUTOR_PRIVATE_KEY`
- `PROFIT_SWEEP_ADDRESS`
- `FLASHBOTS_AUTH_SIGNER_KEY`
- `ETHERSCAN_API_KEY`
- contract addresses and DEX registry config

### Operational Flags
- `MAINTENANCE_MODE`
- `EXECUTION_ENABLED`
- `PREDICTION_ENABLED`
- `ALERT_WEBHOOK_URL`
- `HEALTHCHECK_SHARED_SECRET`

Rules:
- validate every variable at boot with Zod
- crash on missing required prod secrets
- never log raw secret values

---

## Data Persistence

### PostgreSQL

Stores:
- users
- subscriptions
- strategies
- alerts
- API keys
- trades
- route candidates / analytics snapshots where persisted
- audit/config metadata

Persistence requirements:
- mounted volume on single-host deploys
- daily backups
- WAL archiving or equivalent if practical
- tested restore procedure

### Redis

Stores:
- hot pool state
- rate-limit counters
- BullMQ data
- pub/sub channels
- session / refresh token metadata if configured

Persistence:
- enable AOF or RDB strategy appropriate to tolerance
- Redis is partially reconstructible, but queue/session state still matters
- backup at least daily if using it for critical refresh/session queues

### Static Assets

Frontend can be served from container filesystem or mounted artifact directory. User uploads are not central to this product; if added later, use object storage.

---

## Runtime Health and Auto-Pause Rules

### Health Checks per Service

#### API
Healthy when:
- process responds to `/health`
- DB reachable
- Redis reachable
- auth secrets loaded

#### Analytics Engine
Healthy when:
- loop is processing current chain state within configured freshness threshold
- Redis pub/sub active
- last route discovery cycle completed successfully

#### Pool Indexer
Healthy when:
- latest pool update not older than threshold
- RPC or subgraph access functional

#### Mempool Worker
Healthy when:
- WS connection to node active
- messages received within freshness window
- decoding pipeline not stalled

#### Executor
Healthy when:
- wallet loaded
- nonce sync healthy
- Flashbots/private relay reachable
- execution queue not jammed with stale jobs

### Auto-Pause Conditions

Set `EXECUTION_ENABLED=false` or equivalent runtime safety lock when any of the following occurs:
- RPC latency exceeds threshold for sustained interval
- mempool worker disconnected beyond threshold
- gas oracle unavailable and no fallback
- wallet nonce mismatch persists
- profit simulation drift exceeds defined tolerance in recent window
- PostgreSQL unavailable for execution bookkeeping
- Redis unavailable if execution depends on it for synchronization

Dashboard should surface that the system is in monitoring-only degraded mode.

---

## Deployment Pipeline

### CI Workflow

On pull request:
1. install dependencies
2. lint
3. typecheck
4. backend tests
5. frontend tests
6. build frontend
7. build backend/worker bundles
8. optionally build Docker images

On main branch merge:
1. rerun required tests
2. build tagged images
3. push to registry or prepare deploy artifacts
4. deploy to staging automatically
5. run smoke tests
6. manual approval for production deploy
7. deploy production
8. run post-deploy health checks

### CD Strategy

For first production release, use straightforward rolling replacement:
- pull latest images/artifacts
- run database migration
- deploy API
- deploy workers in safe order
- deploy frontend/Nginx reload
- run smoke checks

Safe order:
1. database migration
2. api (compat with both old/new workers if possible)
3. non-executor workers
4. executor last

If schema changes are dangerous, pause execution before migration.

---

## Database Migration Policy

- all schema changes via Prisma migrations
- production migrations must be backward compatible whenever possible
- deploy code that can tolerate both pre- and post-migration states briefly if needed
- never run destructive migration without backup confirmation
- if trades table partitioning or large-index creation becomes expensive, schedule maintenance window

Before production migration:
- snapshot backup
- verify disk space
- check active execution queue empty or paused

---

## Nginx Configuration Requirements

Nginx must:
- serve frontend SPA with `try_files` fallback to `index.html`
- proxy `/api` to API container
- proxy WebSocket endpoint with upgrade headers
- compress static assets
- set secure cache headers for fingerprinted JS/CSS
- disable cache for HTML shell
- cap request body size to sensible limits
- log access/error with rotation

Potential route split:
- root marketing pages and SPA can coexist if frontend router handles public/auth pages; otherwise use separate app and marketing build targets

---

## Process Management

### Docker Compose

Compose is acceptable for local and early production if disciplined.

Required compose characteristics:
- named services for each worker role
- restart policies
- environment files separated by environment
- healthcheck declarations
- named volumes for Postgres and Redis
- internal network isolation

### PM2

PM2 can be used inside containers for clustered API workers, but avoid double-supervision complexity unless needed. Preferred approach:
- one process per container
- scale API horizontally via multiple container replicas

If PM2 is used on non-container VPS deploys:
- separate apps per worker role
- memory restart thresholds
- log file paths and rotation
- startup persistence across reboot

---

## Secrets Management

For early stage:
- store production secrets in host-managed environment files with strict file permissions
- separate staging and production secret sets
- never commit `.env` files
- rotate JWT, Stripe, RPC, and wallet-related secrets on incident

Longer term:
- move to managed secret store if infrastructure matures

Wallet rules:
- executor wallet key only on production host(s) that actually execute
- never present on frontend builds or generic staging unless explicitly testing with low-risk keys
- cold sweep address stored separately and validated

---

## Monitoring and Alerting

### Metrics to Track

Infrastructure:
- CPU
- memory
- disk
- container restarts
- DB connections
- Redis memory
- API latency

Product/Execution:
- route discovery cycle duration
- pool freshness lag
- mempool message throughput
- simulation success/failure rate
- execution attempts
- bundle inclusion rate
- reverted trades
- net profit over time
- gas spent
- stale opportunity rate

### Logging

Use structured JSON logging with fields like:
- service
- environment
- chainId
- strategyId
- routeId
- tradeId
- txHash
- correlationId
- severity

Never log:
- private keys
- full JWTs
- full API secrets
- sensitive PII beyond what is necessary for debugging

### Alerts

Send alerts for:
- service down
- repeated failed executions
- rising revert rate
- DB backup failure
- low disk space
- mempool disconnect
- Stripe webhook failures

Delivery channel can be Telegram webhook, email, or both.

---

## Backup and Recovery

### Backup Schedule

- PostgreSQL: nightly full dump + optionally more frequent WAL/archive strategy
- Redis: daily snapshot if used for critical queue/session persistence
- environment config: secure off-host backup
- deployed image tags / release manifests: retained for rollback

### Recovery Targets

- restore DB to previous night within acceptable RTO
- rebuild Redis cache from chain and DB if needed
- redeploy prior image version within minutes

### Disaster Recovery Scenarios

#### Host failure
- provision replacement VPS
- restore env files and images
- restore PostgreSQL backup
- restore domain/Nginx config
- keep execution disabled until chain connectivity and state catch up

#### Bad deploy causing incorrect execution behavior
- trigger immediate execution pause
- rollback API/worker images
- inspect recent trade divergence
- resume only after smoke and simulation checks pass

---

## Security Hardening Checklist

- SSH key auth only
- firewall allow only SSH/80/443 or stricter
- fail2ban if appropriate
- automatic security updates or scheduled patching
- Docker daemon access restricted
- database access local/internal only
- Redis protected, non-public, with auth where applicable
- separate admin account from routine operator account
- periodic secret rotation schedule

---

## Staging vs Production Differences

| Concern | Staging | Production |
|---|---|---|
| Billing | test Stripe keys | live Stripe keys |
| RPC | sandbox/limited providers | dedicated low-latency providers / own node |
| Execution | disabled or testnet-only | enabled with risk controls |
| Alerts | dev channels | production channels |
| Domain | staging subdomain | primary domain |
| Data retention | disposable | backed up and retained |

Never let staging point to live execution wallet.

---

## Rollback Procedure

1. detect issue via smoke test, metrics, or alert
2. if execution-affecting, set system pause immediately
3. identify last known good image/tag and migration compatibility
4. rollback API and worker images
5. if migration incompatible, restore backup or deploy forward fix depending on impact
6. re-run smoke tests
7. resume execution only after health and simulation gates pass

Maintain a simple release ledger with:
- image tags
- migration version
- deployment time
- operator
- rollback notes

---

## Provisioning Targets

### Minimum Early Production VPS
- 8 vCPU
- 16–32 GB RAM
- NVMe SSD
- stable network and low-latency region close to Ethereum relay/RPC infrastructure

### Better Split Setup
- App host: 4–8 vCPU, 16 GB RAM
- Execution/chain host: 8–16 vCPU, 32+ GB RAM
- Managed or dedicated DB if operational load grows

Sizing must be revisited once multi-chain and historical analytics scale up.

---

## Implementation Notes for Coding Agent

- Produce Docker and deployment artifacts that mirror this topology, but do not over-engineer for Kubernetes unless explicitly requested
- Keep executor isolated and restartable independently from API
- Build health endpoints and readiness checks before relying on automation
- Treat `EXECUTION_ENABLED` / maintenance switches as first-class infrastructure controls, not ad hoc environment hacks
- Make every deployment step auditable, scriptable, and reversible
