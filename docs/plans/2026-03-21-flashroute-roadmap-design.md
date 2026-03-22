# FlashRoute Phased Roadmap Design

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Full-platform phased roadmap for FlashRoute

---

## Goal

Build FlashRoute as a production-grade flash-loan arbitrage monitoring, analytics, billing, and controlled execution platform, with a monitoring-first release path and execution disabled by default until safety gates are satisfied.

## Context

This repository currently contains the FlashRoute specification package rather than implementation code. The governing sources for this design are:

- `PACKAGE-SUMMARY.md`
- `CODING-AGENT-BRIEFING.md`
- `24-BUILD-ORDER.md`
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

---

## Section 1: Architecture

### Monorepo Shape

Use a TypeScript monorepo so all application surfaces can share validated contracts while keeping failure domains isolated.

Recommended top-level layout:

```text
apps/
  api/
  web/
  analytics-engine/
  mempool-worker/
  executor/
  jobs-worker/
packages/
  config/
  db/
  shared/
  ui/
  blockchain/
  contracts/
docs/
infra/
```

### Backend Shape

The backend uses Fastify for the public API and separates services by product domain:

- auth
- users/settings
- API keys
- opportunities
- strategies
- trades
- analytics
- alerts
- billing
- admin
- execution

Hot-path trading logic must remain isolated from SaaS and admin concerns. Chain-facing workers own pool ingestion, mempool prediction, graph updates, simulation, and execution workflows. The API server owns authenticated CRUD, entitlement checks, admin actions, and WebSocket fanout.

### Data and State Boundaries

PostgreSQL is the durable source of record for users, subscriptions, strategies, trades, analytics, alerts, runtime config, and audit history. Redis owns hot state such as current pool state, route caches, live opportunities, pub/sub events, execution locks, nonces, and queue coordination.

The complete schema from `02-DATABASE-SCHEMA.md` must be established in Phase B, not incrementally introduced table-by-table. This includes auth tables and the cross-cutting strategy, trade, billing, analytics, alerts, config, and audit tables that later phases depend on.

### Frontend Shape

The frontend uses React, TypeScript, Vite, Tailwind, React Router, TanStack Query, Zustand, React Hook Form, and Zod. It is organized into route groups:

- public marketing pages
- auth pages
- protected product pages
- admin pages

TanStack Query remains the source of truth for server state. Zustand is reserved for local UI state, connection state, shell preferences, and short-lived client workflows.

### Real-Time Model

REST handles snapshots and mutations. WebSocket handles live opportunities, live trades, alerts, pool updates, and system messages. Workers publish into Redis channels and the API server bridges those messages to WebSocket subscribers.

### Safety Posture

Execution is part of the architecture, but remains disabled by default. Monitoring and analytics are delivered first. Execution can only become available after simulation quality, entitlement enforcement, health checks, auditability, emergency pause controls, and release gates have all passed.

---

## Section 2: Milestone-by-Milestone Build Design

### Phase A: Foundation

Deliver the monorepo, package manager setup, TypeScript strict mode, linting/formatting, env validation, shared config, logger, DB/Redis bootstrap, worker bootstrap, frontend shell, design tokens, and state/query foundations.

Outcome: the frontend and backend boot successfully and the repository has a stable structural skeleton.

### Phase B: Core Data and Auth

Implement the complete Prisma schema and migrations first, then add registration, login, refresh/logout, password reset, email verification, 2FA, profile/security settings, API key basics, and protected routing.

Outcome: authenticated users can enter a real product shell backed by the complete durable schema.

### Phase C: Monitoring MVP

Implement pool indexing, normalized reserve caching, graph construction, route discovery, demand prediction from pending swaps, profit simulation, opportunities API, WebSocket delivery, dashboard stats, and opportunities UI.

Outcome: a monitoring-first MVP that is already usable and commercially meaningful without enabling execution.

### Phase D: Product Depth

Implement strategy CRUD, activation controls, strategy detail/edit flows, trade persistence, trade list/detail pages, and analytics pages with route, competitor, and gas views.

Outcome: the operator can configure system behavior, analyze results, and review historical activity.

### Phase E: Commercial Layer

Implement Stripe billing, subscription sync, entitlement resolution, plan-gated features, billing UI, public marketing pages, API keys, alerts, admin users, admin system health, and runtime config controls.

Outcome: the platform becomes a monetizable SaaS with internal operational controls.

### Phase F: Controlled Execution

Implement the executor contract, flash-loan provider abstraction, transaction construction, private relay submission, nonce management, result tracking, auto-pause logic, and emergency controls.

Outcome: execution is available in a controlled environment only after all safety boundaries are in place.

### Phase G: Hardening

Complete test suites, documentation, Docker/compose/Nginx artifacts, CI workflows, backups, rollback docs, observability, and full quality-gate verification.

Outcome: the system is reproducible, operable, and ready for monitoring-only or controlled-execution launch depending safety status.

---

## Section 3: Testing, Deployment, and Quality

### Testing Strategy

Testing is phase-scoped and risk-weighted:

- Phase A: boot, config, and package integration tests
- Phase B: auth flows, guards, token rotation, and settings tests
- Phase C: pool ingestion, route discovery, demand prediction, simulation, and WebSocket live-update tests
- Phase D: strategy CRUD, trades read models, analytics state tests
- Phase E: Stripe lifecycle, entitlement enforcement, admin guards, audit logging, and billing UI tests
- Phase F: execution gating, health-linked blocking, nonce safety, and emergency pause tests
- Phase G: full regression, end-to-end flows, deployment smoke, and operational runbook verification

### Frontend Quality

Every major page must explicitly handle loading, error, empty, and loaded states. Live pages must also handle disconnected, reconnecting, stale-with-data, and permission-restricted states.

### Backend Quality

All API contracts use validated schemas. Role checks and plan enforcement are centralized. Logging, health endpoints, queue visibility, and audit trails are established early rather than postponed.

### Deployment Model

The deliverables include Dockerfiles, compose files, Nginx config, CI workflows, backup scripts, recovery docs, and environment validation. The first production topology may be a single VPS with containers, but the design keeps workers separable for future growth.

### Release Gates

Each phase has a pass/fail checkpoint before the next phase begins. Billing does not unlock before entitlements are authoritative. Execution does not unlock before monitoring, analytics, billing enforcement, admin controls, observability, and safety toggles are proven.

### Operating Principle

If there is tension between impressive capability and safe operation, choose the monitoring-first, observable, reversible path.

---

## Approved Decisions

- Use a phased full-platform roadmap rather than an all-at-once implementation.
- Preserve the build order in `24-BUILD-ORDER.md`.
- Implement the full durable schema in Phase B.
- Keep execution disabled by default until explicit safety gates pass.
- Build a sellable monitoring product before monetization depth and before on-chain execution.

---

## Next Step

Create a detailed implementation plan in `docs/plans/2026-03-21-flashroute-full-platform-roadmap.md` with exact file targets, task ordering, TDD checkpoints, verification commands, and milestone gates.
