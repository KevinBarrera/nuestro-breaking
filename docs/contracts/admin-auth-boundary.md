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

## Team management API (#214)

Only users with an active `admin` role in `global` scope can call these endpoints. Anyone else, including event-scoped admins and judges, gets the same `401 Unauthenticated` as a missing session. Mutations also need the trusted `Origin` and the `X-CSRF-Token` header (`403 Request denied` otherwise). Responses that carry a link or the team list send `Cache-Control: no-store`.

| Endpoint                                | Request                          | Success                                    | Errors                                                                                                    |
| --------------------------------------- | -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `GET /admin/team`                       | none                             | `200 { members: Member[] }`                | `401`                                                                                                     |
| `POST /admin/team`                      | `{ displayName, email, access }` | `201 { userId, activationUrl, expiresAt }` | `400 { fieldErrors }` (`invalid` per field, or `access: "unknown_event"`); `409 { code: "email_in_use" }` |
| `POST /admin/team/:userId/invitation`   | none                             | `201 { userId, activationUrl, expiresAt }` | `404 { code: "member_not_found" }`; `409 { code: "member_deactivated" }`                                  |
| `DELETE /admin/team/:userId/invitation` | none                             | `200 { cancelled: true }`                  | `404 { code: "member_not_found" }` or `{ code: "no_open_invitation" }`                                    |

- `access` is `{ kind: "global" }` or `{ kind: "events", eventIds: [...] }` (1 to 100 unique existing event ids). The email is trimmed and lowercased.
- `Member` is `{ id, displayName, email, status, access, invitation }`. `status` is `active` (has a password), `pending` (no password yet) or `deactivated` (`users.active = false`). `access` is `{ kind: "global" }` or `{ kind: "events", events: [{ id, name }] }`. `invitation` is the open invitation, `{ expiresAt, expired }`, or `null`; it is always `null` for a `deactivated` member, even when an open invitation row remains, because activation refuses that member's links. Only users with an active `admin` role are listed; judge-only accounts are not.
- Inviting creates the user without a password, its roles and a 72-hour invitation. The response is the only time the link (`<admin origin>/activar-cuenta#<token>`) is shown; only the token digest is stored. Any email that already has an account gets `409`, including judges; pending and deactivated admins use regenerate or (later) reactivate instead.
- Regenerate cancels the open invitation, if any, and issues a new link. It works for pending admins and, as the password-recovery path, for active ones, the caller included; the current password keeps working until the new link is used.
- Every change writes `admin_team_audit` (`invited` with `details.access`, `invitation_regenerated` with `details.replacedOpenInvitation`, `invitation_cancelled`) with the actor user and session and the target user.

## Account activation API (#214)

The public activation page reads the token from the link fragment and sends it in the JSON body, never in the query string. Both routes need the exact trusted `Origin` (`403 Request denied` otherwise, audited as `denied`), like sign-in.

| Endpoint                      | Request               | Success                                 | Errors                                                                                     |
| ----------------------------- | --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /auth/activation/check` | `{ token }`           | `200 { displayName, email, expiresAt }` | `400 Invalid request`; `410` invalid link                                                  |
| `POST /auth/activation`       | `{ token, password }` | `200 { activated: true }`               | `400 Invalid request`; `400 { message: "Weak password", failedRules }`; `410` invalid link |

- Any link that cannot be used (unknown, malformed, expired, used, cancelled, replaced by a newer link, or for a deactivated user) gets the same `410 { statusCode: 410, message: "Invalid or expired link", code: "invalid_link" }`, so the response never reveals which case applies.
- `failedRules` lists the ids from the shared password policy (`min_length`, `max_length`, `lowercase`, `uppercase`, `digit`, `symbol`, `no_control_characters`). The password is checked before the token, and a weak password leaves the link open.
- Activation stores the Argon2id hash, marks the invitation used, revokes every existing session of the user, and writes `admin_team_audit` `activated` with the invitee as actor, no session and `details.revokedSessions`. It does not sign the user in; the frontend sends them to sign-in.
- Neither sign-in nor activation is rate limited yet; the 256-bit token makes guessing impractical, and per-IP throttling for both is a follow-up.

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
