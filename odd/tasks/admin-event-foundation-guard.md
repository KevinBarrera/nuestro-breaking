# Admin event foundation guard

## Tracking

- GitHub issue: #84 — Protect admin event foundation endpoint with session guard
- Branch: `feat/84-admin-event-foundation-guard`
- Follows: #78 and #82

## Goal

Protect the existing admin event foundation read endpoint with the backend session foundation, so the first admin event data endpoint is no longer public.

## Tasks

- [x] Create approved GitHub issue and MVP project item.
- [x] Map the smallest guard integration over the existing identity-access and event foundation code.
- [x] Add RED backend e2e coverage for unauthenticated, invalid, non-admin, scoped-role, and authorized reads.
- [x] Implement the session/role guard and wire it to `GET /admin/events/:eventId/foundation`.
- [x] Verify focused and full backend checks plus repository formatting.
- [ ] Open PR and merge after checks pass.

## Constraints

- Do not build frontend sign-in UI or route enforcement in this slice.
- Do not add public registration, full user/role management, password recovery, QR/PIN/check-in credentials, payment authorization, or broader event/activity CRUD.
- Preserve the existing event foundation response shape for authorized callers.
- Denials must not leak protected event data or account/session existence.
- Keep global admin/judge roles allowed for MVP foundation; event-scoped roles should be supported for the requested event.

## Evidence

- Issue #84 created and labeled `status:approved`, `type:feature`, `area:backend`, `area:admin`, `risk:medium`, and `mvp:foundation`.
- Issue #84 added to the November 2026 MVP project.
- RED: focused e2e (`event-foundation.e2e-spec.ts auth-session.e2e-spec.ts --runInBand`) failed 4 foundation cases before the guard: anonymous request returned 404 rather than 401, and both scoped admin/judge requests for another event returned 200. Auth session suite passed.
- GREEN: focused e2e passed (2 suites, 11 tests); full backend e2e passed (5 suites, 29 tests). Backend lint, build, repository `format:check`, and `git diff --check` passed.
- Endpoint policy: generic 401 `Unauthenticated` for missing/invalid/expired/revoked sessions, suspended users, dancer/inactive/revoked roles, and disallowed scopes. Only active unrevoked global admin/judge or event-scoped admin/judge for the requested event may read; organization-scoped roles are denied pending policy. The existing authorized response shape and 404 for missing events remain unchanged. Only this GET endpoint is guarded.
