# Coding Agent Briefing — FlashRoute

---

## What You Are Building

You are building **FlashRoute**, a production-grade flash-loan arbitrage route optimization platform with two business modes:

1. **Direct operator mode** — a founder/operator uses the system to discover, simulate, and optionally execute profitable cross-DEX arbitrage routes
2. **SaaS mode** — paying users access monitoring, analytics, alerts, strategy management, API access, and, for higher tiers, automated execution features

This is not a toy crypto dashboard. It is a full-stack system with:
- a React frontend
- a Fastify API
- PostgreSQL persistence
- Redis cache/pub-sub/queue infrastructure
- real-time WebSocket updates
- multiple background workers
- Stripe billing
- optional smart contract and execution components

---

## Non-Negotiable Rules

1. **Do not invent architecture that contradicts the package.** If a file specifies Fastify + Prisma + PostgreSQL + Redis, use that stack.
2. **Do not collapse everything into one giant service file or one giant frontend store.** Respect modularity.
3. **Do not implement vague placeholders and move on.** Every major page and service in this package has explicit expectations.
4. **Do not enable automated execution by default.** Monitoring-first, execution only after safety gates pass.
5. **Do not ship role/plan gating only in the UI.** Backend enforcement is mandatory.
6. **Do not store secrets or execution keys in unsafe places.**
7. **Do not fabricate production profit metrics.** Sample/demo data must be clearly labeled outside real operation.

---

## Read These Files First

Before generating code, read in this order:
1. `01-ARCHITECTURE.md`
2. `02-DATABASE-SCHEMA.md`
3. `03-API-SPECIFICATION.md`
4. `04-ALGORITHMS.md`
5. `05-BACKEND-FOUNDATION.md`
6. `19-FRONTEND-STATE.md`
7. `14-FRONTEND-DESIGN-SYSTEM.md`
8. `24-BUILD-ORDER.md`

Then read domain-specific files before implementing each subsystem.

---

## What Good Looks Like

A successful implementation will produce:
- an authenticated SaaS dashboard with professional UX
- real-time opportunities feed with route details and live updates
- strategy CRUD with plan-aware controls
- trade history, trade detail, and analytics pages
- billing and subscription enforcement
- admin controls and system health views
- deployment artifacts and tests
- a safe path to execution without assuming execution must be enabled on day one

The resulting codebase should feel like a real product that a founder could deploy, sell, and operate.

---

## Recommended Build Sequence

Follow `24-BUILD-ORDER.md`. The short version:

### Stage 1 — Foundations
- repo/tooling
- config validation
- DB/Redis/bootstrap
- frontend shell and design system
- query/state setup

### Stage 2 — Auth and Core Data
- schema + migrations
- auth backend
- auth pages
- protected routing

### Stage 3 — Monitoring MVP
- pool state ingestion
- route discovery
- demand prediction
- opportunities API + live feed
- dashboard/opportunities UI

### Stage 4 — Product Depth
- strategy CRUD
- trades list/detail
- analytics pages
- alerts and settings

### Stage 5 — Commercial Layer
- marketing pages
- pricing and billing
- API keys
- admin pages and system controls

### Stage 6 — Controlled Execution
- contract
- execution engine
- private submission
- safety pause controls

### Stage 7 — Hardening
- tests
- docs
- deployment
- quality gates

---

## Architectural Shape to Preserve

### Backend
Separate modules/services for:
- auth
- users/settings
- billing
- strategies
- trades
- opportunities
- analytics
- alerts
- admin
- API keys
- execution
- workers (analytics/indexer/mempool/executor/jobs)

### Frontend
Separate route groups for:
- marketing/public pages
- auth pages
- protected product pages
- admin pages

Use:
- TanStack Query for server state
- Zustand for local UI state
- React Hook Form + Zod for forms
- component primitives from the design system

### Data and Real-Time
- REST for snapshots and mutations
- WebSocket for live updates
- Redis pub/sub to bridge backend worker events to API/WebSocket clients
- PostgreSQL as source of record

---

## Areas Where Agents Usually Mess This Up

### 1. Overbuilding the wrong thing first
Do not start with smart contracts, fancy chart polish, or obscure microservices. Get the monitoring product working first.

### 2. Weak plan enforcement
If Monitor/Trader/Executor tiers exist, encode entitlements centrally and enforce them server-side.

### 3. Bad state management
Do not mirror all API responses into Zustand. Use React Query for server state.

### 4. Fake real-time
Polling-only may be acceptable as a fallback, but the spec expects WebSocket live updates where called for.

### 5. Missing four-state pages
Every major page needs loading, error, empty, and loaded states.

### 6. Unsafe execution assumptions
Execution is a privileged, failure-prone workflow. It needs pause controls, health checks, and risk boundaries.

### 7. Documentation left until never
Docs and deployment artifacts are part of the product, not optional extras.

---

## Product Priorities

### Highest Priority
- architecture integrity
- auth correctness
- opportunities visibility
- strategy and trade UX
- billing and gating coherence
- safety and observability

### Medium Priority
- marketing polish
- docs preview experience
- advanced chart micro-interactions

### Lower Priority for v1
- excessive theming complexity
- animation-heavy experiences
- speculative multi-chain abstractions beyond currently supported chains

---

## Frontend Expectations

The frontend should feel like an operator dashboard, not a generic admin template.

Required qualities:
- dark, data-dense, readable UI
- fast route changes and page loads
- robust handling of live updates and disconnected states
- sensible empty states that guide action
- strong forms and validation copy
- accessible controls even in dense layouts

Important pages:
- `/dashboard`
- `/opportunities`
- `/strategies`
- `/trades`
- `/analytics`
- `/settings`
- `/billing`
- `/admin/users`
- `/admin/system`
- public marketing routes

---

## Backend Expectations

The backend should be modular, validated, and explicit.

Required qualities:
- typed DTOs and schemas
- consistent error handling
- rate limits by tier
- role checks and entitlement checks
- health endpoints
- clear worker boundaries
- auditable admin actions
- structured logging

When performance matters:
- optimize hot paths such as opportunity calculation and event propagation
- do not prematurely optimize every CRUD path at the expense of clarity

---

## Testing Expectations

At minimum, implement tests covering:
- auth flows
- strategy CRUD
- opportunity live updates
- billing upgrade flow
- admin guards
- execution safety toggles and health-linked blocking logic
- key frontend pages in all major states

Use `20-FRONTEND-TESTS.md` and `13-BACKEND-TESTS.md` as concrete guides.

---

## Deployment Expectations

Deliver:
- Dockerfiles
- docker-compose for local/dev and possibly early production
- Nginx reverse proxy config
- CI workflow
- environment validation
- backup and rollback documentation

See `21-DEPLOYMENT.md` and `22-DOCUMENTATION.md`.

---

## If You Need to Make Judgment Calls

Prefer the choice that:
1. preserves safety
2. preserves observability
3. preserves modularity
4. preserves future monetization flexibility
5. gets a monitoring MVP shipped sooner

If there is tension between “impressive” and “operable,” choose operable.

---

## Final Reminder

This package is designed to generate a serious product, not an outline-level prototype. Build the monitoring and analytics spine first, commercialize it second, and only then open the execution path under explicit controls.
