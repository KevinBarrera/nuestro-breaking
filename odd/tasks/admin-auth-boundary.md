# Admin auth boundary

## Tracking

- GitHub issue: #78 — Define minimal admin authentication and access boundary
- Branch: `feat/78-admin-auth-boundary`

## Goal

Define and begin the minimum safe admin authentication and access boundary for the November 2026 MVP, so future protected admin workflows do not depend on public endpoints or fake frontend auth.

## Tasks

- [x] Explore current issue scope, ADRs, security docs, frontend session boundary, and backend admin endpoint state.
- [x] Define the minimal MVP admin auth boundary and safe-denial contract.
- [x] Identify follow-up implementation slices if this issue remains design-first.
- [ ] Verify documentation and any changed code with focused checks.
- [ ] Prepare work-unit summary for maintainer review.

## Constraints

- Do not build full user management UI.
- Do not add public account registration.
- Do not add payment authorization, check-in credentials, QR/PIN flows, password recovery, or complete role administration.
- Do not implement fake frontend authentication.
- Preserve ADR 0002: username/password authentication with opaque PostgreSQL sessions.
- Keep operational/security ownership gaps explicit when they are not required for the minimum safe boundary.

## Evidence

- Initial exploration found ADR 0002 already selects username/password auth with opaque PostgreSQL sessions in an HttpOnly, Secure, SameSite cookie.
- `RoleAreaBoundary` currently records allowed roles but intentionally does not enforce access.
- `EventFoundationController` currently exposes `GET /admin/events/:eventId/foundation` without an auth/session guard.
- `docs/security/privacy-threat-model.md` plans Argon2id verification, opaque PostgreSQL sessions, protected cookie attributes, CSRF/origin protection, safe denials, and durable authentication audit, but leaves session lifetime/renewal and operational ownership unresolved.
- Added `docs/contracts/admin-auth-boundary.md` to define the design-first MVP boundary: admin sign-in, session read, sign-out, first protected admin endpoint, safe denials, frontend behavior, explicit exclusions, and follow-up implementation slices.
- Updated the contract after independent verification to require durable audit of session creation, denial, and revocation, and to state that state-changing auth endpoints are not usable until CSRF/origin protections are implemented.
- Updated `docs/frontend-architecture.md` and `docs/contracts/event-activity-api-boundary.md` to cross-reference the new boundary instead of leaving auth mechanics unspecified.
