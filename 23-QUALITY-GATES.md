# Quality Gates: FlashRoute Context Package

---

## Purpose

This file defines the validation standard that the generated application must satisfy before the package can be considered implementation-ready and before the built product can be considered deployable. These are not vague aspirations. They are pass/fail gates.

There are two layers of quality gates:

1. **Context package gates** — verify the specification set is complete and coherent
2. **Built application gates** — verify the implementation produced from this package meets technical, product, and safety requirements

---

## Layer 1 — Context Package Gates

### Gate 1: File Completeness

**Pass when:**
- all numbered files `00` through `24` exist
- `CODING-AGENT-BRIEFING.md` exists
- `PACKAGE-SUMMARY.md` exists
- no placeholder or empty files remain

**Fail examples:**
- missing deployment or test docs
- a file exists but is only a short outline
- summary files absent

### Gate 2: Word Count Depth

**Pass when:**
- total package word count is well above minimum threshold
- no critical file is implausibly thin for its topic
- frontend, backend, algorithm, deployment, and test docs all show real substance

**Practical target for this package:** 40,000+ words minimum, with stronger confidence above that.

### Gate 3: Stack Consistency

**Pass when:**
- frontend docs consistently target React + TypeScript + Vite + Tailwind + TanStack Query + Zustand
- backend docs consistently target Node.js + TypeScript + Fastify + Prisma + PostgreSQL + Redis + BullMQ
- deployment docs match the chosen stack
- no silent technology swaps appear between files

### Gate 4: Domain Consistency

**Pass when:**
- route discovery, demand prediction, simulation, execution, and analytics terminology match across files
- chain and DEX examples remain internally coherent
- pricing tiers, permissions, and feature access are not contradictory

### Gate 5: Implementation Specificity

**Pass when:**
- documents specify endpoints, entities, states, workflows, and failure modes
- frontend files cover loading/error/empty/loaded states
- deployment files specify concrete services and operational controls
- tests describe exact scenarios, not generic “should work” language

### Gate 6: Revenue Path Clarity

**Pass when:**
- package clearly supports both direct operator value and subscription SaaS value
- pricing/billing and marketing documents identify buyer segments and tier mapping
- dashboard/admin docs support a realistic monetization model

### Gate 7: Safety Coverage

**Pass when:**
- execution-related docs explicitly cover failure modes and pause controls
- risk disclosure exists in marketing/docs specs
- admin/deployment docs include monitoring, rollback, backup, and emergency procedures

---

## Layer 2 — Built Application Gates

These gates apply to the actual implementation generated from the package.

---

## LOC Verification Script

The coding agent must create a root-level script named `count-loc.sh` and run it after each major implementation phase.

```bash
#!/bin/bash
set -euo pipefail

echo "=== LOC COUNT ==="
echo "Backend source:"
find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -name "*.spec.*" | xargs wc -l | tail -1

echo "Frontend source:"
find client/src/ -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -name "*.spec.*" | xargs wc -l | tail -1

echo "Tests:"
find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) | xargs wc -l | tail -1

echo "Total:"
find . -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | tail -1
```

### Required Verification Prompts After Each Build Phase

After each major build phase, the coding agent must answer all of these:
1. Run `count-loc.sh` and report current totals by layer.
2. List any service methods that still return placeholder values or TODO stubs.
3. List any API endpoints that are not yet backed by real database queries.
4. Confirm whether all background workers for that phase are registered and bootable.
5. Confirm whether all relevant frontend pages implement loading, error, empty, and loaded states.

---

## Product Functionality Gates

### Gate 8: Auth Flow Complete

**Pass when:**
- user can register, verify email, log in, log out, refresh session, reset password
- 2FA flow works if enabled
- protected routes do not flash private content before auth resolution

### Gate 9: Strategy Management Complete

**Pass when:**
- user can create, edit, activate, pause, and delete strategies
- validation rules are enforced in UI and backend
- strategy settings affect route filtering/execution behavior as specified

### Gate 10: Live Opportunity Visibility

**Pass when:**
- opportunities page loads snapshot data
- live updates arrive through WebSocket or fallback polling
- chain filtering works
- expired opportunities are removed or clearly marked stale

### Gate 11: Trade History and Detail Fidelity

**Pass when:**
- trade list supports filtering, sorting, pagination
- trade detail exposes route, gas, flash loan, and net profit details
- simulated vs actual comparison is visible when available

### Gate 12: Analytics Usability

**Pass when:**
- dashboard and analytics pages render meaningful charts and tables
- no metric tiles depend on fabricated data in production
- period selectors and filters update the correct datasets

### Gate 13: Billing and Plan Enforcement

**Pass when:**
- pricing tiers are represented consistently across public site, billing UI, and backend enforcement
- checkout and portal flows work
- gated features are truly restricted by plan/role
- upgrade state is reflected correctly in UI entitlements

### Gate 14: Admin Controls Operational

**Pass when:**
- admin-only routes are protected
- system health renders real dependency state
- pause/resume execution and config changes are auditable and confirmed
- admin quick actions cannot be triggered accidentally

---

## Backend/Infrastructure Gates

### Gate 15: API Contract Compliance

**Pass when:**
- endpoints match `03-API-SPECIFICATION.md`
- request and response schemas validate correctly
- consistent error format is used everywhere
- authorization and rate limiting behave by tier

### Gate 16: Data Layer Integrity

**Pass when:**
- schema matches `02-DATABASE-SCHEMA.md`
- migrations apply cleanly
- indexes exist for key queries
- cascade/constraint rules behave as specified

### Gate 17: Worker Topology Functions

**Pass when:**
- pool indexer, analytics engine, mempool worker, executor, and jobs worker start independently
- failures in one worker do not crash unrelated services
- health endpoints or heartbeats make stale workers observable

### Gate 18: WebSocket Reliability

**Pass when:**
- connection, reconnect, resubscribe, and event handling work
- duplicate events do not duplicate UI rows
- stale disconnected states surface warnings instead of silent failure

### Gate 19: Deployment Reproducibility

**Pass when:**
- local, staging, and production environments can be started from documented steps
- environment validation fails fast when config is incomplete
- Nginx/API/frontend routing works end-to-end
- TLS and reverse proxy are correctly configured in production

### Gate 20: Observability and Logs

**Pass when:**
- logs include correlation identifiers for critical workflows
- health/status data is visible to operators
- alerting exists for execution-impacting failures
- secrets never appear in logs

### Gate 21: Backup and Recovery Preparedness

**Pass when:**
- PostgreSQL backup process exists and is documented
- restore procedure has been tested at least once in staging or dev
- rollback path for bad deploy is documented and realistic

---

## Security and Safety Gates

### Gate 22: Secret Handling

**Pass when:**
- secrets come from environment or secret store, never committed files
- execution keys stay out of frontend and non-executor contexts
- staging and production credentials are separated

### Gate 23: Authorization Correctness

**Pass when:**
- free/trader/executor/institutional/admin access rules are enforced in API and frontend
- hidden UI alone is not relied on for security
- admin actions require authenticated, authorized server checks

### Gate 24: Execution Safety Controls

**Pass when:**
- automated execution can be disabled globally
- unhealthy chain/worker states trigger execution pause or block
- low-quality simulation or stale state cannot silently keep firing trades

### Gate 25: Risk Disclosure Presence

**Pass when:**
- public site and docs clearly state no guaranteed profits
- operator-facing docs explain DeFi, gas, and execution risks
- billing/marketing copy avoids deceptive claims

---

## Frontend Quality Gates

### Gate 26: Four-State Coverage

**Pass when:**
Every major page implements and tests:
- loading state
- error state
- empty state where relevant
- loaded state

### Gate 27: State Separation Discipline

**Pass when:**
- server state is managed through TanStack Query
- client UI state uses Zustand or local form state
- no giant ad hoc global object duplicates server truth unnecessarily

### Gate 28: Accessibility Baseline

**Pass when:**
- navigation works by keyboard
- dialogs manage focus correctly
- icon-only buttons have labels
- status indicators are not color-only
- basic contrast and semantics are acceptable

### Gate 29: Performance Baseline

**Pass when:**
- dashboard pages do not stall under live updates
- long lists are paginated or virtualized appropriately
- repeated event bursts do not explode render counts or memory usage

---

## Testing Gates

### Gate 30: Backend Test Coverage

**Pass when:**
- critical algorithm and API flows have strong automated test coverage
- auth, billing, execution paths, and workers all have tests
- regressions around pricing/role gating are covered

### Gate 31: Frontend Test Coverage

**Pass when:**
- auth pages, dashboard, strategies, billing, admin, and live update flows are covered
- route guards and plan gates are tested
- high-risk UI state transitions have integration tests

### Gate 32: End-to-End Critical Paths

**Pass when:**
At least these journeys are automated:
- register/login/protected route
- create strategy
- billing upgrade handoff
- live opportunities rendering
- admin route protection

---

## Commercial Readiness Gates

### Gate 33: Tier Packaging Coherence

**Pass when:**
- public pricing, billing logic, feature gating, and user guide say the same thing
- upgrade paths are obvious
- institutional path has clear sales capture route

### Gate 34: Support Burden Reduction

**Pass when:**
- docs, empty states, help text, and error copy are sufficient that common user questions are answered in-product or in docs
- admin runbook exists for common incidents

### Gate 35: MVP-to-Scale Path

**Pass when:**
- deployment plan supports single-VPS launch
- architecture documents a credible scale-up path to multiple chains and more users without total rewrite

---

## Release Checklist

Before declaring the built product ready:

1. all required services boot
2. migrations apply cleanly
3. frontend builds without type errors
4. backend tests pass
5. frontend tests pass
6. e2e smoke passes
7. environment variables validated
8. Stripe webhooks verified in target environment
9. execution remains disabled until post-deploy smoke passes
10. backups confirmed
11. monitoring/alerts confirmed
12. rollback target identified

---

## Failure Policy

If any critical gate fails:
- do not label the system production-ready
- do not enable automated execution
- do not claim commercial readiness
- fix the failed gate or explicitly downgrade launch scope to a smaller safe mode (for example monitoring-only beta)

---

## Implementation Notes for Coding Agent

- Turn these gates into actual CI/CD checks where feasible, not just prose
- Add checklists to PR templates and release templates
- Prefer objective pass criteria over subjective “looks good” reviews
- Treat execution safety and plan enforcement as release blockers, not nice-to-haves
