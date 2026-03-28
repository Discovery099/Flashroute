# FlashRoute Setup Guide

Complete environment setup for local development and production deployment.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Local Development Setup](#local-development-setup)
- [Production Deployment](#production-deployment)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Running Services](#running-services)
- [First Admin User](#first-admin-user)
- [Stripe Setup](#stripe-setup)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22.x LTS | Required for runtime and package management |
| pnpm | 9.x | Fast, disk-space efficient package manager |
| Docker | 24.x+ | For PostgreSQL, Redis, and production containers |
| Docker Compose | 2.x+ | Orchestrating local infrastructure |
| Git | Any recent | Version control |

Install pnpm: `npm i -g pnpm`

---

## Quick Start (5 Minutes)

```bash
# 1. Clone the repository
git clone https://github.com/Discovery099/flashroute.git
cd flashroute

# 2. Run the interactive setup wizard
node setup.js

# 3. Start all services
docker compose up -d
pnpm install
pnpm --filter @flashroute/db migrate deploy
pnpm --filter @flashroute/api dev &
pnpm --filter @flashroute/web dev

# 4. Open the app
open http://localhost:5173
```

The wizard will check prerequisites, create your `.env`, install dependencies, and start Docker infrastructure.

---

## Local Development Setup

### 1. Environment Configuration

```bash
cp .env.example .env
```

Minimum required in `.env` for local dev:

```env
NODE_ENV=development
DATABASE_URL=postgresql://flashroute:flashroute@localhost:5432/flashroute
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=dev-access-secret-at-least-32-chars-long
JWT_REFRESH_SECRET=dev-refresh-secret-at-least-32-chars-long
COOKIE_SECRET=dev-cookie-secret-32-chars-min
ENCRYPTION_KEY=dev-encryption-key-32-chars-min
```

### 2. Start Infrastructure

```bash
docker compose up -d postgres redis
```

Wait for services to be healthy:

```bash
docker compose ps
# Both postgres and redis should show "healthy"
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Run Database Migrations

```bash
pnpm --filter @flashroute/db migrate deploy
```

To reset the database during development:

```bash
pnpm --filter @flashroute/db migrate reset
```

### 5. Start Development Servers

```bash
# API server (port 3000)
pnpm --filter @flashroute/api dev

# Frontend (port 5173)
pnpm --filter @flashroute/web dev

# Jobs worker (port 3001)
pnpm --filter @flashroute/jobs-worker dev
```

Or use `pnpm dev` at the root to start all workspaces concurrently.

### 6. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Expected: { "status": "ok", "timestamp": "..." }
```

---

## Production Deployment

### Docker Compose (Recommended)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with production values

# Build and start all services
docker compose -f docker-compose.prod.yml up -d

# Follow logs
docker compose -f docker-compose.prod.yml logs -f

# Check status
docker compose -f docker-compose.prod.yml ps
```

### Manual Production Setup

For VPS or bare-metal deployment, see [Operator Setup Guide](./docs/operator-setup.md).

### Environment Validation

Before starting in production, validate your `.env`:

```bash
node deploy/scripts/validate-env.js
```

This will fail fast on missing required variables and warn on suspicious values.

---

## Environment Variables

Full reference: [Environment Reference](./docs/environment-reference.md)

### Required for All Environments

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | `development` or `production` | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://:pass@host:6379` |
| `JWT_ACCESS_SECRET` | Access token signing key (min 64 chars) | `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | Refresh token signing key (min 64 chars) | `openssl rand -base64 64` |
| `COOKIE_SECRET` | Cookie encryption key (min 32 chars) | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | General encryption key (min 32 chars) | `openssl rand -base64 32` |

### Required for Billing

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhooks |
| `FRONTEND_URL` | Public URL of the frontend |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `MAINTENANCE_MODE` | `false` | Enable maintenance mode |
| `EXECUTION_ENABLED` | `false` | Enable trade execution (Phase F) |
| `RESEND_API_KEY` | none | Email delivery via Resend |

---

## Database Migrations

Migrations are managed with Prisma. All migration files are in `packages/db/prisma/migrations/`.

### Apply Migrations

```bash
# Development (with migration history)
pnpm --filter @flashroute/db migrate deploy

# Reset (DESTRUCTIVE — deletes all data)
pnpm --filter @flashroute/db migrate reset
```

### Create a New Migration

```bash
# After changing schema.prisma
pnpm --filter @flashroute/db migrate dev --name description_of_change
```

### Generate Prisma Client

```bash
pnpm --filter @flashroute/db generate
```

---

## Running Services

### API Server (`apps/api`)

Fastify REST + WebSocket API. Handles auth, strategies, trades, billing, and admin routes.

```bash
pnpm --filter @flashroute/api dev     # Development (with hot reload)
pnpm --filter @flashroute/api build   # Production build
pnpm --filter @flashroute/api start   # Production start
pnpm --filter @flashroute/api test    # Run tests
```

Health endpoint: `GET /health`

### Frontend (`apps/web`)

React SPA. Connects to API for all data and auth.

```bash
pnpm --filter @flashroute/web dev     # Vite dev server (port 5173)
pnpm --filter @flashroute/web build   # Production build
pnpm --filter @flashroute/web preview # Preview production build
pnpm --filter @flashroute/web test    # Run tests
```

### Jobs Worker (`apps/jobs-worker`)

BullMQ background jobs. Pool snapshots, competitor tracking, alert evaluation, cleanup.

```bash
pnpm --filter @flashroute/jobs-worker dev   # Development
pnpm --filter @flashroute/jobs-worker start # Production
pnpm --filter @flashroute/jobs-worker test  # Run tests
```

Health endpoint: `GET /health` (port 3001)

---

## First Admin User

Create your first admin via the UI or API:

### Via UI

1. Register at `http://localhost:5173/register`
2. In the database, manually update your user role:

```bash
psql $DATABASE_URL -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

### Via API

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/users/{userId}/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"role": "admin"}'
```

---

## Stripe Setup

### 1. Create Stripe Account

Sign up at https://stripe.com and get your API keys from the dashboard.

### 2. Configure Webhooks

In Stripe Dashboard → Webhooks → Add endpoint:

```
https://your-domain.com/api/v1/billing/webhook
```

Events to listen for:
- `checkout.session.completed`
- `subscription.updated`
- `subscription.deleted`
- `invoice.payment_failed`

### 3. Add Webhook Secret to .env

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Create Products and Prices

Create in Stripe Dashboard and update `apps/api/src/modules/billing/prices.ts` with your price IDs.

---

## Troubleshooting

### PostgreSQL connection fails

```bash
# Check if container is running
docker compose ps

# Check logs
docker compose logs postgres

# Verify connection string
psql $DATABASE_URL -c "SELECT 1"
```

### Redis connection fails

```bash
# Check if container is running
docker compose ps

# Check logs
docker compose logs redis

# Test connection
redis-cli -u $REDIS_URL ping
```

### Port already in use

```bash
# Find what's using port 3000 (API)
lsof -i :3000
# or on Windows
netstat -ano | findstr :3000

# Kill the process or change the port in .env
```

### `pnpm install` fails

```bash
# Clear pnpm cache and reinstall
pnpm store prune
rm -rf node_modules
pnpm install
```

### TypeScript errors after pulling

```bash
# Clear ts-buildinfo and regenerate types
pnpm typecheck
pnpm --filter @flashroute/db generate
```

### Frontend build fails

```bash
# Clear Vite cache
rm -rf node_modules/.vite
pnpm --filter @flashroute/web build
```

---

## Next Steps

- [Operator Setup Guide](./docs/operator-setup.md) — Full production deployment checklist
- [Execution Safety Guide](./docs/execution-safety.md) — Before enabling trade execution
- [Environment Reference](./docs/environment-reference.md) — Complete env var reference
