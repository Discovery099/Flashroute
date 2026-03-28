## Pull Request

### Description

<!-- Briefly describe what this PR does and why. Link to any relevant issues. -->

### Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update (no code change)
- [ ] Refactoring (no functional changes)
- [ ] Infrastructure/DevOps (CI/CD, Docker, etc.)

### Checklist

- [ ] Tests pass locally (`pnpm test`, `pnpm --filter @flashroute/api test`, `pnpm --filter @flashroute/web test`, `pnpm --filter @flashroute/jobs-worker test`)
- [ ] TypeScript compiles with no errors (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Frontend builds successfully (`pnpm build`)
- [ ] No secrets, credentials, or sensitive values committed (check `.env`, logs, and any new files)
- [ ] New environment variables are documented in `docs/environment-reference.md`
- [ ] New features are documented (inline docs, `docs/` updates, or `SPEC.md` if applicable)
- [ ] Breaking changes are clearly noted with migration instructions

### Verified By

- [ ] Manual testing on local Docker Compose stack
- [ ] Reviewed sensitive value handling (auth, billing, execution paths)
- [ ] Verified WebSocket reconnection behavior (if changed)
- [ ] Checked database migrations are safe and reversible

### Additional Notes

<!-- Any other context reviewers should know about? -->
