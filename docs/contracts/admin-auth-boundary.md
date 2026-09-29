# Admin authentication boundary

This document defines the minimum admin authentication and access boundary for the November 2026 MVP. It is a design contract for future implementation; it does not claim that authentication is already implemented.

## Current answer

The MVP admin boundary uses server-side username/password sign-in and opaque PostgreSQL-backed sessions, as selected by ADR 0002.

```text
POST /auth/admin/sign-in
GET /auth/session
POST /auth/sign-out
GET /admin/events/:eventId/foundation
```

`GET /admin/events/:eventId/foundation` is the first admin API that must move behind this boundary before future protected admin workflows depend on it.

## Why this boundary

| Need                                           | Boundary decision                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Avoid fake frontend auth.                      | The browser asks the backend for the current session instead of inventing a local admin user.                 |
| Keep secrets out of browser code.              | The browser receives only an opaque session cookie, not password hashes, tokens, or reusable credentials.     |
| Protect admin foundation data first.           | The existing admin event foundation endpoint becomes the first protected API boundary.                        |
| Avoid building a broad auth product too early. | Registration, role administration, recovery, support access, and detailed audit operations remain follow-ups. |

## Minimum identity model

| Concept    | MVP rule                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Identity   | One server-owned user record with stable id, email or username, display name, and active/suspended state.        |
| Credential | One password verifier per sign-in-capable identity, stored only as an Argon2id PHC hash.                         |
| Role       | `admin` and `judge` are admin-capable roles for `/admin`; `dancer` is not.                                       |
| Scope      | Admin-capable access must be evaluated against the current event when a protected event-scoped API is requested. |
| Lifecycle  | Expired, revoked, suspended, or out-of-scope access is denied at request time.                                   |

The first implementation may seed or manually provision admin identities. Public self-registration and user-management UI are out of scope.

## Session contract

| Step              | Requirement                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in           | Server verifies username/password and creates an opaque PostgreSQL session when accepted.                                             |
| Browser storage   | Only the session identifier reaches the browser, in an `HttpOnly`, `Secure`, `SameSite` cookie.                                       |
| Session check     | Protected APIs read the cookie and validate the server-side session, expiry, revocation state, identity state, role, and event scope. |
| Sign out          | Server revokes the current session and clears the cookie.                                                                             |
| Expiry/revocation | Expired or revoked sessions fail even if the browser still sends the cookie.                                                          |
| Audit             | Session creation, denied sign-in/session checks, and revocation must be durably audited before the server reports the outcome.        |
| CSRF/origin       | State-changing auth endpoints, including sign-in and sign-out, are not usable until CSRF and origin protections are implemented.      |

Session lifetime, renewal policy, exact cookie name, and production Argon2id parameters must be selected in the implementation slice before release use.

## Protected admin API boundary

The first protected API is:

```http
GET /admin/events/:eventId/foundation
```

| Part        | Rule                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller      | Must have a valid active server-side session.                                                                                                     |
| Role        | Must be `admin` or `judge`.                                                                                                                       |
| Event scope | Must be allowed for the requested `eventId`.                                                                                                      |
| Response    | Returns the existing foundation payload only after access is accepted.                                                                            |
| Rejection   | Must not reveal whether the event exists, whether the account exists, whether the password was wrong, or whether the session was expired/revoked. |

Until this boundary is implemented, new admin commands should not rely on this endpoint as protected infrastructure.

## Safe denial behavior

| Situation                                            | API behavior                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Missing session cookie                               | Deny with a generic unauthenticated response.                                                |
| Invalid, expired, or revoked session                 | Deny with the same generic unauthenticated response and clear the session cookie when safe.  |
| Active session without admin-capable role            | Deny with a generic unauthorized/not-found response that does not include event data.        |
| Admin-capable role outside the requested event scope | Deny with the same safe response used for inaccessible or missing event data.                |
| Invalid sign-in attempt                              | Deny without saying whether the account exists, password was wrong, or identity is inactive. |

The exact status-code split may be chosen during implementation, but responses must not disclose protected event data or account/session existence.

## Frontend route boundary

`RoleAreaBoundary` remains the frontend place for admin-route protection, but it must not create a mock session. The frontend behavior should be:

1. Ask `GET /auth/session` for the current server session.
2. Render `/admin` routes only when the backend reports an active admin-capable session.
3. Redirect or show a sign-in/denied state when the backend reports missing or invalid access.
4. Avoid storing passwords, password hashes, or session tokens in frontend state.

The existing in-memory session entity may cache the current server-reported user for rendering, but the backend remains authoritative for protected API decisions.

## Implementation follow-up slices

1. **Backend session foundation**: database tables/migration for password hashes, sessions, scoped roles, durable auth audit, sign-in/session/sign-out endpoints, protected cookie settings, and CSRF/origin controls required before those state-changing endpoints are usable.
2. **Backend admin guard**: protect `GET /admin/events/:eventId/foundation` and update e2e tests so unauthenticated access is denied and authenticated admin-capable access succeeds.
3. **Frontend boundary integration**: replace non-enforcing `RoleAreaBoundary` behavior with server session read, sign-in/denied UI, and route-level loading state.
4. **Operational hardening**: finalize session lifetime/renewal, Argon2id parameters, audit retention, incident ownership, and provisioning process.

## Explicit exclusions

This boundary does not include:

- public account registration;
- full user management UI;
- password recovery;
- complete role administration;
- QR/PIN/check-in credentials;
- payment authorization;
- production incident/runbook ownership;
- support access or privileged-access review workflows.

## Cross-references

- [ADR 0002: Use Username/Password Authentication with Opaque PostgreSQL Sessions](../adr/0002-identity-session.md)
- [Privacy and Security Threat Model](../security/privacy-threat-model.md)
- [Bounded Contexts and Ownership](../models/bounded-contexts.md)
- [Event/activity API boundary](event-activity-api-boundary.md)
- [Identity and Access Specification](../../openspec/changes/breaking-event-system-foundation/specs/identity-access/spec.md)
