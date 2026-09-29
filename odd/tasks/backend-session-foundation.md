# Backend session foundation

## Tracking

- GitHub issue: #82 — Implement backend session foundation for admin auth
- Branch: `feat/82-backend-session-foundation`
- Follows: #78 — Define minimal admin authentication and access boundary

## Goal

Implement the minimum backend session foundation required by the admin authentication boundary before protected admin workflows rely on public endpoints.

## Tasks

- [x] Create approved GitHub issue and MVP project item.
- [x] Map existing backend database, test harness, dependency, and NestJS module conventions.
- [x] Add RED backend tests for sign-in/session/sign-out and safe denials.
- [x] Implement the minimum database schema/migration and identity-access module.
- [x] Verify focused backend checks and repository formatting.
- [ ] Open PR and merge after checks pass.

## Constraints

- Preserve ADR 0002: username/password authentication with opaque PostgreSQL sessions.
- Store only Argon2id PHC password hashes; never log or expose password hashes.
- Return only a protected opaque session cookie to the browser.
- Durably audit session creation, denial, and revocation.
- State-changing auth endpoints are not usable until CSRF/origin protections are implemented.
- Do not add public registration, full user management UI, frontend route enforcement, password recovery, complete role administration, QR/PIN/check-in credentials, payment authorization, or production operations ownership.

## Evidence

- Issue #82 created and labeled `status:approved`, `type:feature`, `area:backend`, `area:admin`, `risk:medium`, and `mvp:foundation`.
- Issue #82 added to the November 2026 MVP project.
- RED: `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json auth-session.e2e-spec.ts --runInBand` failed 5/5 before implementation (missing `users.active` and `/auth/session` returned 404).
- GREEN: same focused command passed 5/5 after the migration, module, controller, and cookie/CSRF implementation. Triangulation covers stored session digest, role removal, expired/revoked/suspended sessions, cross-session CSRF, and mismatched origins.
- Validation: focused e2e 5/5 passing; full backend e2e initially exposed a stale migration-count assertion in `event-activity-foundation.e2e-spec.ts` after adding migration `0004_admin_sessions`; the assertion was updated from 4 to 5. `corepack pnpm --filter @nuestro-breaking/backend lint`, `corepack pnpm --filter @nuestro-breaking/backend build`, `corepack pnpm format:check`, and `git diff --check` all pass (Node engine warning: requested 24.18.1, observed 24.19.0).
- Design: `nb_admin_session` is a 32-byte random hex cookie (`HttpOnly`, `Secure`, `SameSite=Strict`), only its SHA-256 digest is stored. Sessions expire after eight hours without renewal; sign-out is audited atomically with revocation. Origin must exactly match `AUTH_TRUSTED_ORIGIN` (default `http://localhost:5173`) for sign-in/sign-out; only JSON sign-in is accepted, and sign-out also requires a session-bound CSRF header. `GET /auth/session` returns only safe identity/expiry and provides the CSRF value in an exposed response header for page reloads. Browser API access needs HTTPS for Secure cookies. Default Argon2id hash parameters are used for manual provisioning; production benchmarking/rehash policy and environment-specific origin/cookie configuration remain follow-ups. The admin event foundation guard remains a separate slice.
- Independent verification found two blocking gaps: unknown-account sign-in skipped Argon2 verification, and roles were not scoped. Fixes added a dummy Argon2id verification path for missing/unconfigured identities and expanded `user_roles` with scope type, scope id, active/revoked lifecycle fields, and active-role filtering. The stale full-e2e migration-count assertion was updated from 4 to 5 because this slice intentionally adds migration `0004_admin_sessions`.
