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

`POST /auth/admin/sign-in` and `GET /auth/session` return `user.globalAdmin`: `true` when the user has an active `admin` role in `global` scope (#214). The admin UI uses it only to show the Equipo screens; every team request is still checked on the server.

## Implementation follow-up slices

1. **Backend session foundation**: database tables/migration for password hashes, sessions, scoped roles, durable auth audit, sign-in/session/sign-out endpoints, protected cookie settings, and CSRF/origin controls required before those state-changing endpoints are usable.
2. **Backend admin guard**: protect `GET /admin/events/:eventId/foundation` and update e2e tests so unauthenticated access is denied and authenticated admin-capable access succeeds.
3. **Frontend boundary integration**: replace non-enforcing `RoleAreaBoundary` behavior with server session read, sign-in/denied UI, and route-level loading state.
4. **Operational hardening**: finalize session lifetime/renewal, Argon2id parameters, audit retention, incident ownership, and provisioning process.

## Team management API (#214)

Global administrators manage who can use the admin panel: they invite people, share a one-time activation link, change which events each person sees, and turn access off and on. Nobody sets another person's password; a new link is the recovery path (#214 D2).

### Who can call it

- Only users with an active `admin` role in `global` scope. Anyone else, including event-scoped admins and judges, gets the same `401 Unauthenticated` as a missing session.
- Mutations also need the trusted `Origin` and the `X-CSRF-Token` header (`403 Request denied` otherwise).
- Responses that carry a link or the team list send `Cache-Control: no-store`.
- A `:userId` that is not a UUID gets `400`. Any letter case is accepted and treated as the same id.
- Every change re-checks the caller after taking the team lock: a caller who lost global admin access or was deactivated while the request waited gets the same `401` and nothing changes.

### Endpoints

| Endpoint                                | Request                          | Success                                               | Error codes                                                                               |
| --------------------------------------- | -------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /admin/team`                       | none                             | `200 { members: Member[] }`                           | none                                                                                      |
| `POST /admin/team`                      | `{ displayName, email, access }` | `201 { userId, activationUrl, expiresAt }`            | `400`, `email_in_use`                                                                     |
| `POST /admin/team/:userId/invitation`   | none                             | `201 { userId, activationUrl, expiresAt }`            | `member_not_found`, `member_deactivated`                                                  |
| `DELETE /admin/team/:userId/invitation` | none                             | `200 { cancelled: true }`                             | `member_not_found`, `no_open_invitation`                                                  |
| `PUT /admin/team/:userId/access`        | `{ access, reason? }`            | `200 { changed }`                                     | `400`, `member_not_found`, `self_change`, `last_global_admin`                             |
| `POST /admin/team/:userId/deactivate`   | `{ reason }`                     | `200 { status: "deactivated" }`                       | `400`, `member_not_found`, `self_deactivation`, `last_global_admin`, `member_deactivated` |
| `POST /admin/team/:userId/reactivate`   | `{ reason? }`                    | `200 { status: "active" }` or `{ status: "pending" }` | `400`, `member_not_found`, `member_active`                                                |

Request fields:

- `access` is `{ kind: "global" }` or `{ kind: "events", eventIds: [...] }` (1 to 100 unique existing event ids).
- `email` is trimmed and lowercased; `displayName` is trimmed, up to 200 characters.
- `reason` is trimmed, 1 to 500 characters, without control characters. It is required to deactivate and optional otherwise.

### Member statuses

`Member` is `{ id, displayName, email, status, access, invitation }`. Only users with an active `admin` role are listed; judge-only accounts are not.

| `status`      | Meaning                                    | Can sign in | Next actions                                       |
| ------------- | ------------------------------------------ | ----------- | -------------------------------------------------- |
| `active`      | Has set a password.                        | Yes         | Regenerate (recovery), change access, deactivate   |
| `pending`     | Invited, no password yet.                  | No          | Regenerate, cancel link, change access, deactivate |
| `deactivated` | `users.active = false`; access turned off. | No          | Reactivate, change access                          |

- `access` is `{ kind: "global" }` or `{ kind: "events", events: [{ id, name }] }`.
- `invitation` is the open invitation, `{ expiresAt, expired }`, or `null`. It is always `null` for a `deactivated` member, even when an open invitation row remains, because activation refuses that member's links.

### Rules

| Action        | Behavior                                                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite        | Creates the user without a password, its roles and a 72-hour invitation. The response is the only time the link (`<admin origin>/activar-cuenta#<token>`) is shown; only the token digest is stored. Any email that already has an account is refused, judges included. |
| Regenerate    | Cancels the open invitation, if any, and issues a new link. Works for pending members and, as the password-recovery path, for active ones, the caller included; the current password keeps working until the new link is used.                                          |
| Cancel        | Cancels the open invitation; the member stays pending.                                                                                                                                                                                                                  |
| Change access | Replaces the member's admin roles: roles no longer granted are revoked (`active = false`, `revoked_at` set) and new ones are added. The same access again is a no-op (`changed: false`, not audited). Sessions stay valid and see the new scope on the next request.    |
| Deactivate    | Sets `users.active = false`, revokes every session of the member at once and cancels any open invitation. The admin roles stay, so reactivating restores the same access.                                                                                               |
| Reactivate    | Sets `users.active = true`. An activated member signs in with their existing password; one who never activated is `pending` again and needs a regenerated link.                                                                                                         |

Two safety rules apply to access changes and deactivation:

- **No self-changes.** A global admin cannot change their own access or deactivate themself. The check compares ids, so an uppercased own id is refused too.
- **At least one global admin remains.** A change that would leave no activated global admin (an active user with a password and an active global `admin` role) is refused. Every team change is serialized under one database lock, so two global admins deactivating each other at the same time still leave one: the second request finds its caller deactivated and gets `401`.

### Error codes

All are JSON bodies with `statusCode`, `message` and `code`, except `400`, which carries `fieldErrors` (`invalid` per field, or `access: "unknown_event"`) and never echoes the submitted values.

| Status | `code`               | When                                                          |
| ------ | -------------------- | ------------------------------------------------------------- |
| `404`  | `member_not_found`   | The user does not exist or has no active `admin` role.        |
| `404`  | `no_open_invitation` | Cancel found no open invitation.                              |
| `409`  | `email_in_use`       | Invite: the email already has an account.                     |
| `409`  | `member_deactivated` | Regenerate or deactivate a member who is already deactivated. |
| `409`  | `member_active`      | Reactivate a member who is not deactivated.                   |
| `409`  | `self_change`        | The caller tried to change their own access.                  |
| `409`  | `self_deactivation`  | The caller tried to deactivate themself.                      |
| `409`  | `last_global_admin`  | The change would leave no activated global admin.             |

### Audit

Every change writes one `admin_team_audit` row with the actor user and session, the target user and the reason, if any.

| `action`                 | `details`                                |
| ------------------------ | ---------------------------------------- |
| `invited`                | `access`                                 |
| `invitation_regenerated` | `replacedOpenInvitation`                 |
| `invitation_cancelled`   | none                                     |
| `scope_changed`          | `from`, `to` (each an `access` value)    |
| `deactivated`            | `revokedSessions`, `cancelledInvitation` |
| `reactivated`            | `status` (`active` or `pending`)         |

`activated` (see below) and `bootstrapped` ([admin bootstrap runbook](../runbooks/admin-bootstrap.md)) are written by the invitee and by the hosted command, without an actor session.

## Account activation API (#214)

The public activation page reads the token from the link fragment and sends it in the JSON body, never in the query string. Both routes need the exact trusted `Origin` (`403 Request denied` otherwise, audited as `denied`), like sign-in.

| Endpoint                      | Request               | Success                                 | Errors                                                                                     |
| ----------------------------- | --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /auth/activation/check` | `{ token }`           | `200 { displayName, email, expiresAt }` | `400 Invalid request`; `410` invalid link                                                  |
| `POST /auth/activation`       | `{ token, password }` | `200 { activated: true }`               | `400 Invalid request`; `400 { message: "Weak password", failedRules }`; `410` invalid link |

- Any link that cannot be used (unknown, malformed, expired, used, cancelled, replaced by a newer link, or for a deactivated user) gets the same `410 { statusCode: 410, message: "Invalid or expired link", code: "invalid_link" }`, so the response never reveals which case applies.
- `failedRules` lists the ids from the shared password policy (`min_length`, `max_length`, `lowercase`, `uppercase`, `digit`, `symbol`, `no_control_characters`). The password is checked before the token, and a weak password leaves the link open.
- Activation stores the Argon2id hash, marks the invitation used, revokes every existing session of the user, and writes `admin_team_audit` `activated` with the invitee as actor, no session and `details.revokedSessions`. It does not sign the user in; the frontend sends them to sign-in.
- No `/auth/*` route (sign-in, activation check, activation) is rate limited yet. The 256-bit token makes guessing a link impractical; per-IP throttling for these routes is a follow-up.

## Explicit exclusions

This boundary does not include:

- public account registration;
- full user management UI (the team pages arrive in a later slice of #214);
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
