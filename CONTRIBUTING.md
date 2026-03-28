# Contributing to FlashRoute

Thank you for your interest in contributing to FlashRoute.

This document outlines the development workflow, code standards, and how to get your changes merged quickly.

---

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/flashroute.git
cd flashroute
git remote add upstream https://github.com/Discovery099/flashroute.git
```

### 2. Create a Feature Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation only
- `refactor/` — code refactoring without behavior change
- `test/` — adding or improving tests
- `chore/` — tooling, CI, dependency updates

### 3. Develop

```bash
# Install dependencies
pnpm install

# Start dev servers
pnpm dev

# Run tests as you work
pnpm --filter @flashroute/api test --run --watch
pnpm --filter @flashroute/web test --run --watch
```

### 4. Keep Your Branch Updated

```bash
git fetch upstream
git rebase upstream/main
```

### 5. Run the Full Quality Check

Before pushing, ensure everything passes:

```bash
pnpm typecheck    # TypeScript compiles cleanly
pnpm lint         # No lint errors
pnpm test         # All tests pass
pnpm build        # Production build succeeds
```

### 6. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat(api): add strategy activation endpoint"
git commit -m "fix(web): resolve race condition in dashboard refresh"
git commit -m "docs: update environment reference for Stripe webhook setup"
```

### 7. Push and Open a PR

```bash
git push origin feat/your-feature-name
```

Open a Pull Request against `main` on the upstream repo.

---

## Code Standards

### TypeScript

- Strict mode is enabled — no `any` without explicit justification
- Prefer `unknown` over `any` for truly unknown types
- Use Zod for runtime validation of external data (env vars, API responses, Stripe events)
- Avoid type assertions (`as`) in production code; use branded types where necessary

### API Routes (Fastify)

- Use the existing route registration pattern in `apps/api/src/modules/`
- Validate all input with Zod schemas — never trust `req.body` without validation
- Always return a consistent error shape: `{ success: false, error: { code: string, message: string } }`
- Use the `audit` helper for all state-changing operations
- Log at appropriate levels: `info` for business events, `error` for failures, `debug` for detailed flow tracing

### Frontend (React)

- Server state goes through TanStack Query — no ad-hoc `useState` for API data
- Client-only state (UI toggles, form draft) uses Zustand or local `useState`
- Component files are self-contained with their own styles when possible
- All user-facing strings are explicit (no string interpolation that could cause i18n issues)

### Tests

- Unit tests for pure logic, integration tests for route handlers
- E2E tests use the `test-harness.ts` FakePrisma + FakeRedis setup — no live DB required
- Test descriptions should be sentences: `it('returns 401 when credentials are invalid')`
- Aim for deterministic tests — avoid `setTimeout` mocking time in production code paths

### Git

- No committed secrets, credentials, or `.env` files
- No committed generated files (build outputs, lock files other than `pnpm-lock.yaml`)
- Keep commits atomic: one logical change per commit
- Rebase over merge when syncing with upstream

---

## Areas Open for Contribution

### High Priority

- **Phase F (Execution Engine)** — Smart contract integration, private relay submission, nonce management, MEV protection
- **Additional DEX support** — Curve, Balancer, 1inch aggregation
- **Performance** — Virtualization for large opportunity lists, WebSocket message batching
- **Test coverage** — Edge cases in billing webhooks, auth flows, and strategy validation

### Medium Priority

- **Accessibility audit** — Formal axe testing, keyboard navigation pass, ARIA improvements
- **i18n groundwork** — String extraction setup for future localization
- **Mobile responsiveness** — Current UI is desktop-first; tablet/mobile polish is needed

### Lower Priority

- **Dark/light theme toggle** — Currently dark-only
- **Chart customization** — Time range selection, metric toggles on analytics charts
- **API rate limit UI** — Show rate limit headers to users in the frontend

---

## Reporting Issues

### Bug Reports

Use the [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.md). Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (version, deployment type, browser/OS)
- Relevant logs (with sensitive values redacted)

### Feature Requests

Use the [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.md). Describe:

- The problem or gap the feature addresses
- Your proposed solution
- Why you prefer this approach over alternatives

---

## Getting Help

- **Documentation**: https://docs.flashroute.com
- **Issues**: https://github.com/Discovery099/flashroute/issues
- **Discussions**: https://github.com/Discovery099/flashroute/discussions

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
