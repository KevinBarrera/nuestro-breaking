# Frontend admin session

## Tracking

- GitHub issue: #86 — Integrate frontend admin routes with backend session
- Branch: `feat/86-frontend-admin-session`
- Follows: #78, #82, and #84

## Goal

Integrate the admin frontend route boundary with the backend session foundation so admin pages depend on a real server session instead of a non-enforcing boundary.

## Tasks

- [x] Create approved GitHub issue and MVP project item.
- [x] Map the smallest frontend session/sign-in integration over the existing route boundary and admin event foundation page.
- [x] Add RED frontend tests for unauthenticated and authenticated admin behavior.
- [x] Implement backend-session read, minimal sign-in, credentialed admin API calls, and route boundary behavior.
- [x] Verify focused frontend checks plus repository formatting.
- [ ] Open PR and merge after checks pass.

## Constraints

- Do not store passwords, password hashes, raw session cookie values, or reusable tokens in frontend state.
- Do not add public registration, full user management UI, password recovery, role administration UI, QR/PIN/check-in credentials, payment authorization, or production operations ownership.
- Preserve backend auth/session behavior.
- Keep the frontend integration minimal and MVP-focused.

## Evidence

- Issue #86 created and labeled `status:approved`, `type:feature`, `area:admin`, `risk:medium`, and `mvp:foundation`.
- Issue #86 added to the November 2026 MVP project.
- Admin-only boundary reads `GET /auth/session` with credentials before rendering protected routes; judge/admin roles pass, dancer-only or failed sessions show inline sign-in. Dancer route remains unchanged.
- Sign-in posts JSON with credentials, stores only allowlisted identity fields and optional expiry (never password, cookie, or CSRF). Event foundation fetch uses credentials.
- RED: focused Playwright run after test additions: 5 failed (missing sign-in/guard and credentialed requests), 4 passed.
- GREEN: focused Playwright run: 10 passed. Frontend lint and build passed. Repository `format:check` passed after manual formatting. Node engine warning: repository requests 24.18.1; installed 24.19.0.
- Independent verification found no blocking issue. A documentation drift note was addressed by updating `docs/frontend-architecture.md` to describe `AdminSessionBoundary` as enforcing `/admin` access through the backend session.
- PR/merge remains for the parent; this implementation does not commit, push, or open a PR.
