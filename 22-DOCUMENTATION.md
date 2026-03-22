# Documentation Specification: FlashRoute

---

## Objective

The codebase produced from this context package must ship with documentation that helps three audiences succeed quickly:

1. **The builder/operator** deploying and running the stack
2. **The SaaS customer** using monitoring, analytics, alerts, and execution features
3. **The internal maintainer** extending routes, chains, APIs, workers, and smart-contract integrations

Documentation is not a dump of generated endpoint lists. It is a curated system that reduces support load, prevents unsafe execution mistakes, and makes the platform legible to future maintainers.

This document defines required docs, ownership, structure, update triggers, and content expectations.

---

## Documentation Sets Required

| Documentation Set | Audience | Format |
|---|---|---|
| Root README | builders, evaluators | markdown |
| Operator Setup Guide | deployer/operator | markdown |
| Environment Reference | deployer/operator | markdown + env example comments |
| API Reference | integrators, advanced users | markdown or generated docs |
| User Guide | SaaS users | markdown / docs site |
| Execution Safety Guide | operators | markdown |
| Admin Runbook | admins/maintainers | markdown |
| Incident and Recovery Runbook | maintainers | markdown |
| Architecture Overview | maintainers | markdown with diagrams |
| Smart Contract Notes | protocol/contract maintainers | markdown |
| Changelog / Release Notes | operators/users | markdown |

The generated project should centralize these under a `/docs` folder plus root-level entry docs.

---

## Root README Requirements

The README is the front door of the repository. It must be useful within 90 seconds.

### Required Sections

1. **What FlashRoute Is**
   - one-paragraph product/system description
2. **Core Capabilities**
   - route discovery
   - demand prediction
   - execution controls
   - analytics
   - subscriptions/admin
3. **Tech Stack**
   - frontend, backend, database, cache, queue, chain integrations
4. **Architecture Summary**
   - API, workers, DB, Redis, Nginx, blockchain node
5. **Quick Start**
   - install deps
   - configure env
   - start services
   - run migrations
   - start dev servers
6. **Available Scripts**
   - dev, build, test, lint, worker commands
7. **Project Structure**
   - key folders and responsibilities
8. **Documentation Index**
   - links to deeper docs
9. **Safety Note**
   - explicit reminder that execution features should remain disabled until configuration and simulation are verified

### README Tone

Operator-focused, concise, and technical. Avoid marketing fluff inside repository docs.

---

## Operator Setup Guide

### Purpose

Enable a competent operator to go from fresh clone to safe non-production startup, then to production enablement.

### Required Sections

#### 1. Prerequisites
- Node.js version
- pnpm version
- Docker and Docker Compose
- PostgreSQL / Redis if not containerized
- RPC provider or own node access
- Stripe setup for billing
- email provider setup for auth flows

#### 2. Local Startup
Step-by-step:
- clone repo
- copy env file
- install dependencies
- start infra services
- run Prisma migrations
- seed development data if applicable
- start API and frontend
- start worker processes
- visit app URL

#### 3. First Admin User Creation
Document whether bootstrap admin is created via seed script, CLI command, or manual DB update. Avoid undocumented magic.

#### 4. Stripe and Email Wiring
- required keys
- webhook endpoint config
- local tunneling for webhook testing if needed

#### 5. Execution Disabled by Default
State clearly:
- keep execution off initially
- verify dashboard, strategy saves, opportunity scanning, and simulation outputs first
- only then enable execution with low-risk wallet and safeguards

#### 6. Production Bring-Up Checklist
- DNS
- TLS
- backups
- monitoring
- secret storage
- wallet configuration
- private relay config
- maintenance switches

---

## Environment Reference

This should be one of the most complete docs in the codebase because environment drift breaks arbitrage systems quickly.

### Required Format

For every env var document:
- variable name
- required/optional by environment
- example value format
- purpose
- sensitivity level
- default if applicable
- related subsystem

Example entry structure:

| Variable | Required | Example | Purpose | Sensitive |
|---|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://...` | primary DB connection | yes |

### Group by Domain
- core app
- auth/security
- database/cache
- email
- billing
- chains/RPC
- execution wallet
- analytics/alerts
- feature flags

### Safety Notes
Every sensitive execution variable should include warnings, for example:
- never use cold-wallet key as executor key
- staging must not point to production keys
- production env file permissions must be restricted

---

## API Documentation

### Public / Customer API Docs

If API access is a product feature, the generated docs must include:
- auth method
- rate limit model
- endpoint reference
- request/response examples
- pagination model
- error format
- webhook events if offered

### Internal Service Contract Docs

Even if some endpoints are not public, maintainers need an accurate route map.

Document by resource:
- auth
- users
- strategies
- trades
- opportunities
- analytics
- alerts
- billing
- admin
- API keys

### Examples
At minimum provide:
- curl example
- TypeScript/JavaScript example using fetch
- error response example

### Source of Truth
Generated docs should derive from schema/contracts where possible, but human explanations are still required for:
- rate-limited fields
- plan restrictions
- eventual consistency behavior
- real-time update semantics

---

## User Guide

### Purpose

Help dashboard customers become productive without contacting support.

### Required Sections

1. **Getting Started**
   - account creation
   - email verification
   - choosing a plan
2. **Dashboard Overview**
   - what each card and chart means
3. **Strategies**
   - how to create a strategy
   - explanation of min profit, max hops, gas ceiling, risk buffer
4. **Opportunities Feed**
   - what confidence score means
   - why opportunities expire quickly
5. **Trades and Analytics**
   - simulated vs actual
   - gross vs net profit
   - route and gas interpretation
6. **Alerts**
   - how thresholds and cooldowns work
7. **Billing and Plans**
   - tier differences
   - upgrade/downgrade expectations
8. **API Keys**
   - creation, scope, revocation, safe handling
9. **Security Settings**
   - password changes, 2FA, sessions
10. **Common Questions / Troubleshooting**
   - no opportunities visible
   - disconnected live feed
   - checkout issues
   - access denied for features

### Tone

Clear and practical. The reader may understand trading but not the product’s internal semantics.

---

## Execution Safety Guide

This guide is mandatory because mistakes here are expensive.

### Required Topics

#### 1. What FlashRoute Does and Does Not Guarantee
- opportunities are probabilistic until executed
- predicted profitability can decay due to latency, gas, competition, or state changes
- software is not investment advice

#### 2. Wallet Model
- hot wallet for execution only
- minimal balances
- separate cold sweep address
- rotation and revocation procedures

#### 3. Safe Enablement Order
1. deploy stack
2. verify monitoring-only mode
3. confirm worker health
4. validate route simulation quality
5. test with limited size
6. review post-trade analytics
7. only then scale thresholds deliberately

#### 4. Common Failure Modes
- stale pool state
- gas spikes
- nonce issues
- relay failure
- chain reorg
- reverted bundle
- smart contract callback mismatch

#### 5. Emergency Actions
- pause execution
- revoke or rotate executor key
- sweep remaining funds
- inspect last trades
- rollback deploy if issue correlates with release

This guide should be linked prominently from admin and settings sections.

---

## Admin Runbook

### Required Sections

#### User and Role Management
- role semantics
- lock/unlock users
- session revocation
- API key oversight if admin has this visibility

#### System Health
- meaning of each health state
- freshness thresholds
- what “degraded” implies for execution

#### Config Changes
- which config can change at runtime
- safe vs dangerous changes
- audit logging expectations

#### Quick Actions
- pause/resume execution
- force pool resync
- trigger profit sweep
- invalidate caches / restart workers

#### Billing Operations
- investigate subscription issues
- webhook failure triage
- reconcile entitlements if Stripe event is delayed

---

## Incident and Recovery Runbook

This must exist in a single place so operators do not invent procedures under pressure.

### Incident Categories
- authentication outage
- billing outage
- API degradation
- worker crash loop
- execution anomaly
- abnormal revert rate
- stale data ingestion
- database outage
- Redis outage
- disk pressure / backup failure

### For Each Incident
Document:
- symptoms
- likely causes
- immediate containment steps
- investigation steps
- recovery steps
- customer communication guidance if relevant

### Example: Execution Anomaly
Containment:
- pause execution immediately
- preserve logs and recent trade IDs
- compare simulation vs actual deltas
- inspect relay and nonce state
- decide rollback or config correction

---

## Architecture Overview Document

The codebase should include a dedicated architecture doc separate from marketing copy.

### Required Contents
- high-level system diagram
- service dependency map
- request lifecycle
- trade lifecycle from pool update to execution result
- DB + Redis responsibility split
- WebSocket event flow
- worker role explanations
- chain integration boundaries

This doc should help a new maintainer orient quickly before changing core systems.

---

## Smart Contract Documentation

### Required Contents
- contract purpose and threat model
- supported flash loan callbacks
- calldata encoding strategy
- owner-only functions
- emergency withdrawal behavior
- deployment prerequisites
- verification steps on explorer
- testing assumptions and limitations

Also document exactly how backend and contract versions are coupled so upgrades are deliberate.

---

## Changelog / Release Notes

Every production release should record:
- date
- version/tag
- major features
- bug fixes
- schema changes
- infra changes
- operator actions required
- known issues

For execution-sensitive releases, include explicit note on whether simulation or contract behavior changed.

---

## Documentation Quality Standards

Every major doc should satisfy:
- accurate title and audience
- last updated date
- links to related docs
- code or config examples where useful
- no stale placeholders or “TBD” sections
- no contradictions with actual endpoint or env variable names

If the implementation changes an endpoint, worker name, or env variable, docs must change in the same PR.

---

## In-App Documentation Hooks

The application UI should reinforce documentation rather than hiding it externally.

### Required In-App Links / Help Surfaces
- tooltip or helper text on strategy parameters
- link to docs from settings/billing/API keys pages
- link to risk disclosure and execution safety guide near execution-related toggles
- empty states that direct users to setup guides when appropriate
- admin quick actions with confirmation copy and short explanation

### Public Docs Preview
The public site can expose a limited docs preview, but full operational docs remain in product docs or repository docs.

---

## Ownership and Update Triggers

### Docs That Must Update When Features Change
- new plan/tier → pricing docs, billing docs, user guide
- new environment variable → env reference, setup guide
- new worker/service → architecture overview, deployment doc, runbook
- new endpoint → API docs
- new strategy parameter → user guide and safety guide
- new admin action → admin runbook
- contract change → smart contract docs and release notes

### Pull Request Rule
Every feature PR should answer: “What documentation changed because of this?” If the answer is “none,” verify that the feature truly required no docs update.

---

## Suggested `/docs` Structure

```text
/docs
  getting-started.md
  operator-setup.md
  environment-reference.md
  architecture-overview.md
  api/
    authentication.md
    strategies.md
    trades.md
    opportunities.md
    analytics.md
    billing.md
    admin.md
  user-guide/
    dashboard.md
    strategies.md
    alerts.md
    billing.md
    api-keys.md
  runbooks/
    admin-runbook.md
    incident-response.md
    backups-and-restore.md
    execution-safety.md
  contracts/
    executor-contract.md
  releases/
    changelog.md
```

---

## Minimum Acceptance for Documentation Before Release

The product is not ready if any of these are missing:
- README with working quick start
- environment reference
- operator setup guide
- execution safety guide
- API documentation sufficient for API key users
- admin runbook
- incident recovery documentation

These are not optional polish items. They are part of product readiness.

---

## Implementation Notes for Coding Agent

- Build docs structure as part of the repository, not as an afterthought
- Reuse backend schema/types to generate parts of API docs, but add human explanations manually
- Link docs throughout the UI where the user needs them
- Keep operational and safety docs brutally clear; ambiguity here turns into expensive mistakes
