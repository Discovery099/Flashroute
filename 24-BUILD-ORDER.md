# Build Order: FlashRoute

---

## Purpose

This file tells a coding agent exactly what order to implement the FlashRoute system in so dependencies resolve cleanly and the product becomes usable early without building itself into a corner. The sequence prioritizes:

1. strong foundations first
2. fastest path to a working vertical slice
3. safe introduction of execution features
4. early availability of auth, billing, and admin controls
5. testability and deployability throughout

Do not build randomly by file number. Build by dependency graph and risk.

---

## High-Level Phases

| Phase | Goal | Outcome |
|---|---|---|
| A | Foundation | repo, toolchain, infra, config, shared primitives |
| B | Core data/API skeleton | schema, auth, API contracts, basic CRUD |
| C | Analytics vertical slice | pool state → route discovery → dashboard visibility |
| D | Frontend product shell | auth, dashboard, strategies, trades, opportunities |
| E | Billing and admin | subscriptions, feature gating, admin/system controls |
| F | Execution enablement | private submission, wallet handling, safety switches |
| G | Hardening | tests, docs, deployment, observability, polish |

---

## Prerequisite Rule

Before Phase A begins, the coding agent should read at minimum:
- `01-ARCHITECTURE.md`
- `02-DATABASE-SCHEMA.md`
- `03-API-SPECIFICATION.md`
- `04-ALGORITHMS.md`
- `05-BACKEND-FOUNDATION.md`
- `14-FRONTEND-DESIGN-SYSTEM.md`
- this file

Then consult component-specific files when entering each phase.

---

## Phase A — Foundation and Project Skeleton

### Step A1: Repository and Tooling Setup

Implement:
- monorepo or clear app structure for frontend/backend/shared if chosen in architecture
- TypeScript strict configuration
- pnpm workspace if multi-package
- linting, formatting, env validation scaffold
- Docker base files

Depends on:
- `01-ARCHITECTURE.md`
- `05-BACKEND-FOUNDATION.md`

### Step A2: Core Infrastructure Modules

Implement:
- config loader with Zod validation
- logger
- error classes
- API client utilities
- DB client bootstrap
- Redis client bootstrap
- background worker bootstrap pattern

### Step A3: Frontend App Shell Foundation

Implement:
- Vite + React + Router + Tailwind
- design tokens from `14-FRONTEND-DESIGN-SYSTEM.md`
- AppShell, MarketingLayout, core UI primitives
- query client and Zustand stores from `19-FRONTEND-STATE.md`

### Deliverable Checkpoint A

Pass when:
- frontend boots
- backend boots
- DB/Redis connections validate
- shared design system primitives render
- environment validation works

---

## Phase B — Data Model, Auth, and Basic Product Skeleton

### Step B1: Prisma Schema and Migrations

Implement database schema from `02-DATABASE-SCHEMA.md` first.

Reason:
- nearly every subsystem depends on user, strategy, trade, billing, and analytics persistence
- downstream API and UI types derive from schema reality

### Step B2: Auth and User Management Backend

Implement:
- registration
- login
- refresh/logout
- password reset
- email verification
- 2FA setup/disable
- session management

Depends on:
- `06-BACKEND-AUTH.md`
- relevant API specs

### Step B3: Frontend Auth Pages and Protected Routing

Implement:
- `15-FRONTEND-PAGES-AUTH.md`
- auth bootstrap flow from `19-FRONTEND-STATE.md`
- protected layout guards
- header user menu scaffolding

### Step B4: Minimal User Settings Page

Implement profile/security basics early so accounts are manageable during development.

### Deliverable Checkpoint B

Pass when:
- user can register, verify, log in, access protected shell, log out
- DB migrations apply cleanly
- auth tests pass

---

## Phase C — Analytics Vertical Slice

This is the first real product core. Build enough backend power to surface meaningful opportunities before touching billing or advanced admin.

### Step C1: Pool State Indexer + Cache Model

Implement from:
- `05-BACKEND-FOUNDATION.md`
- `07-BACKEND-CORE-1.md`
- `11-BACKEND-JOBS.md`
- `04-ALGORITHMS.md`

Outcome:
- ingest pools
- normalize reserves
- cache hot state in Redis

### Step C2: Graph Builder and Route Discovery

Implement route search engine and candidate generation.

### Step C3: Demand Prediction Engine

Implement mempool monitor + projected reserve updates.

### Step C4: Profit Simulation Layer

Implement gas/slippage-aware net profit calculation and candidate ranking.

### Step C5: Opportunities API + WS Feed

Implement:
- opportunity list endpoint
- live updates channel
- cache-backed freshness model

### Step C6: Frontend Opportunities and Dashboard First Slice

Implement in frontend:
- dashboard basic stats + recent opportunities
- opportunities page
- connection indicator and live updates

Depends on:
- `16-FRONTEND-PAGES-CORE.md`
- `19-FRONTEND-STATE.md`

### Deliverable Checkpoint C

Pass when:
- system can discover/simulate opportunities from live or mocked inputs
- dashboard shows them
- opportunities page updates live
- no execution yet

This is the earliest meaningful monitoring-only MVP.

---

## Phase D — Strategy, Trades, and Analytics UX

### Step D1: Strategy CRUD Backend

Implement:
- create/edit/delete
- activation toggle
- DEX/chain filtering
- validation rules

### Step D2: Strategy Pages Frontend

Implement:
- strategies list
- strategy create/edit
- strategy detail

### Step D3: Trade Persistence and Read APIs

Implement:
- trade recording schema and services
- trade list filters/sort/pagination
- trade detail read model

### Step D4: Trades and Analytics Frontend

Implement:
- trades list/detail
- analytics overview/routes/competitors/gas tabs
- charts and tables

### Deliverable Checkpoint D

Pass when:
- operator can configure strategy rules
- monitor historical trade records
- inspect analytics even before full automated execution launch

---

## Phase E — Billing, Plans, Marketing, and Admin

### Step E1: Stripe and Entitlements Backend

Implement from `10-BACKEND-PAYMENTS.md` and API spec:
- checkout session creation
- webhook processing
- subscription state sync
- plan enforcement helpers

### Step E2: Public Marketing Pages

Implement from `18-FRONTEND-PAGES-MARKETING.md`:
- landing
- pricing
- features
- security
- FAQ
- docs preview
- legal pages

This can partially proceed in parallel with billing backend once route skeleton exists.

### Step E3: Billing UI

Implement:
- current plan page
- plan comparison
- checkout entry points
- Stripe portal handoff

### Step E4: API Keys and Alerts

Implement customer-facing advanced features tied to plan entitlements.

### Step E5: Admin Pages

Implement:
- admin users
- admin system health
- config editor
- quick actions

Depends on:
- `12-BACKEND-ADMIN.md`
- `17-FRONTEND-PAGES-ADMIN.md`

### Deliverable Checkpoint E

Pass when:
- public acquisition funnel exists
- plans are purchasable
- gated features reflect entitlement
- admin can inspect health and manage users

---

## Phase F — Execution Engine and On-Chain Enablement

This phase should start only after monitoring mode, analytics, and safety controls already work.

### Step F1: Smart Contract Implementation and Tests

Implement executor contract, flash loan callbacks, calldata packing, and emergency controls.

### Step F2: Backend Execution Engine

Implement:
- flash loan provider abstraction
- transaction construction
- private relay submission
- nonce management
- execution result tracking

### Step F3: Safety Controls and Auto-Pause

Implement:
- global execution enable flag
- health-linked auto-pause
- simulation vs actual drift monitoring
- emergency pause in admin UI

### Step F4: Trade Finalization and Dashboard Live Execution Results

Ensure confirmed/reverted trades flow through UI and analytics correctly.

### Deliverable Checkpoint F

Pass when:
- execution works in controlled environment
- failures are visible and bounded
- admin/operator can pause instantly

Do not enable production execution before this checkpoint passes with strong tests.

---

## Phase G — Hardening, Docs, Deployment, and Final QA

### Step G1: Frontend Test Suite

Implement from `20-FRONTEND-TESTS.md`.

### Step G2: Backend and Worker Test Completion

Implement from `13-BACKEND-TESTS.md` and algorithm specs.

### Step G3: Documentation Set

Implement docs from `22-DOCUMENTATION.md`.

### Step G4: Deployment Artifacts

Implement:
- Dockerfiles
- compose files
- CI workflows
- Nginx config
- runbooks

From `21-DEPLOYMENT.md`.

### Step G5: Quality Gate Review

Run all checks from `23-QUALITY-GATES.md`.

### Deliverable Checkpoint G

Pass when:
- all critical tests pass
- docs exist
- deploys are reproducible
- system is ready for monitoring-only or execution-enabled launch depending safety status

---

## Parallelization Guidance

Some work can proceed in parallel once foundations exist.

### Safe Parallel Tracks

After Phase A:
- backend auth can proceed while frontend auth pages are built
- design system/component work can continue while API CRUD is built

After Phase C begins:
- opportunities frontend can be built against mocked contracts while analytics backend finalizes
- marketing pages can be implemented in parallel with billing backend after route/layout foundations exist

After Phase E begins:
- docs and deployment scaffolding can start before all features are final, but must be updated at the end

### Unsafe Parallelization

Avoid parallelizing these too early:
- execution engine before route simulation quality is proven
- billing UI before plan/entitlement model is settled
- admin quick actions before underlying backend control points exist
- tests written against unstable unnamed API contracts

---

## Recommended Vertical Slice Milestones

### Milestone 1: Authenticated Monitoring MVP
Includes:
- auth
- dashboard shell
- opportunities feed
- basic strategy storage
- live updates

### Milestone 2: Operator Analytics MVP
Includes:
- trades
- analytics pages
- alerts
- better strategy controls

### Milestone 3: Commercial SaaS MVP
Includes:
- marketing pages
- pricing
- billing
- entitlement gating
- admin user/system views

### Milestone 4: Controlled Execution Release
Includes:
- contract
- executor backend
- safety pause system
- post-trade analytics and recovery flows

---

## Dependency Summary by Context File

| File | Earliest Build Phase |
|---|---|
| 01-ARCHITECTURE | A |
| 02-DATABASE-SCHEMA | B |
| 03-API-SPECIFICATION | B |
| 04-ALGORITHMS | C |
| 05-BACKEND-FOUNDATION | A |
| 06-BACKEND-AUTH | B |
| 07-09 Backend core files | C, F |
| 10-BACKEND-PAYMENTS | E |
| 11-BACKEND-JOBS | C, G |
| 12-BACKEND-ADMIN | E |
| 13-BACKEND-TESTS | G |
| 14-FRONTEND-DESIGN-SYSTEM | A |
| 15-FRONTEND-PAGES-AUTH | B |
| 16-FRONTEND-PAGES-CORE | C, D |
| 17-FRONTEND-PAGES-ADMIN | E |
| 18-FRONTEND-PAGES-MARKETING | E |
| 19-FRONTEND-STATE | A, B, C |
| 20-FRONTEND-TESTS | G |
| 21-DEPLOYMENT | G |
| 22-DOCUMENTATION | G |
| 23-QUALITY-GATES | G |

---

## Explicit File Reference Checklist

The coding agent must explicitly use every numbered file in this package during implementation planning and execution:
- `00-RESEARCH.md`
- `01-ARCHITECTURE.md`
- `02-DATABASE-SCHEMA.md`
- `03-API-SPECIFICATION.md`
- `04-ALGORITHMS.md`
- `05-BACKEND-FOUNDATION.md`
- `06-BACKEND-AUTH.md`
- `07-BACKEND-CORE-1.md`
- `08-BACKEND-CORE-2.md`
- `09-BACKEND-CORE-3.md`
- `10-BACKEND-PAYMENTS.md`
- `11-BACKEND-JOBS.md`
- `12-BACKEND-ADMIN.md`
- `13-BACKEND-TESTS.md`
- `14-FRONTEND-DESIGN-SYSTEM.md`
- `15-FRONTEND-PAGES-AUTH.md`
- `16-FRONTEND-PAGES-CORE.md`
- `17-FRONTEND-PAGES-ADMIN.md`
- `18-FRONTEND-PAGES-MARKETING.md`
- `19-FRONTEND-STATE.md`
- `20-FRONTEND-TESTS.md`
- `21-DEPLOYMENT.md`
- `22-DOCUMENTATION.md`
- `23-QUALITY-GATES.md`
- `24-BUILD-ORDER.md` (this file is the governing execution sequence and must be used continuously during implementation)

## Final Instruction to Coding Agent

Build FlashRoute in the order that gets a real monitoring product working first, then monetizable SaaS flows, then controlled execution. The common failure mode in systems like this is rushing into on-chain execution before the analytics, visibility, and safety surface are mature. Do not do that here.
