# Admin team management — issue #214

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/214 (source of truth for scope and acceptance criteria)
- Design: https://claude.ai/artifact/YBQV2RzxMXEHACc33jpQcG (Equipo, Agregar administrador, Invitación creada, Activa tu cuenta, Desactivar acceso)
- Engram mirror: `odd/admin-team-management/tasks`
- Base: `dev` at `980dc91` (#215 merged)
- Delivery strategy: stacked to `dev`, one PR per slice, following the #179 chain. `Refs #214` on each PR, `Closes #214` on the last one, no `Co-Authored-By`.
- Forecast: about 2,000 authored lines. Slice 1 is T1 and T2 (foundation and bootstrap), slice 2 is T3 and T4 (invitations and activation), slice 3 is T5 and T6 (access changes and contract docs), slice 4 is T7 to T9 (frontend).
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `980dc91`. Review consent is granted without asking when RDD says a review is due on a finished task (user instruction).

## Objective

Global administrators manage who can access the admin panel without a developer, and every hosted environment can create its first global administrator once with a guarded command.

## Current state (explored 2026-10-11)

- Auth routes are only `POST /auth/admin/sign-in`, `GET /auth/session` and `POST /auth/sign-out` (`apps/backend/src/identity-access/auth.controller.ts`). Access checks live in `SessionAccessService`; `authorizeEventAdmin(Mutation)` accepts global or event-scoped admins. There is no global-admin-only check.
- `activeSession` already rejects sessions of users with `users.active = false`, so deactivation takes effect on the next request.
- `digest` (SHA-256 hex) and `randomBytes(32).toString('hex')` tokens can be reused for invitation tokens.
- The password policy is inline in `parseLocalAdminInput` (`local-admin-provisioning.ts`); `users.password_hash` is nullable and must start with `$argon2id$`.
- `admin:provision` is local-only by design and refuses hosted markers, so staging and production have no way to get an administrator.
- `auth_audit` stores only action, user, session and time, with an unnamed CHECK on actions (Postgres name `auth_audit_action_check`, Drizzle name `auth_audit_action_ck`). It cannot hold actor, target, reason or scope changes.
- Migrations are hand-written SQL plus a hand-added `drizzle/meta/_journal.json` entry; the next one is `0020`.
- Frontend `User.roles` holds role names only, so the UI cannot tell a global admin from an event-scoped one.

## Decisions

- D1 (user, 2026-10-11) — Invitations are shared only as a one-time copyable link. No email for now; Brevo can be added later.
- D2 (user, 2026-10-11) — No admin sets another admin's password. To recover access, a global admin issues a new activation link and the person sets their own password.
- D3 (technical default) — A new `admin_team_audit` table records team actions with actor user and session, target user, action, reason and JSON details, instead of widening `auth_audit`.
- D4 (technical default) — A new `admin_invitations` table stores the invited user, the token digest (never the token), `expires_at` (72 hours), `used_at`, `cancelled_at`, `created_by` and `created_at`. At most one open invitation per user.
- D5 (technical default) — The bootstrap command creates a global admin only when no active global admin exists, checked inside the same transaction under an advisory lock, and never prints secrets. It works in hosted environments and prints a one-time activation link instead of taking a password.
- D6 (technical default) — Team management is limited to users with an active `admin` role in `global` scope. Judge roles are out of scope.
- D7 (technical default, 2026-10-11) — Activation links have the form `<admin origin>/activar-cuenta#<token>`: the token sits in the URL fragment, which browsers never send, so it stays out of server and proxy logs. `admin:bootstrap` exits `0` when it issues a link, `1` on errors (bad input, database failure; nothing changes), and `2` when it refuses because the environment already has a global admin (activated, or pending with another email), so automation can tell "already bootstrapped" from a failure.

## Tasks

- [x] T1 — Backend foundation: migration `0020` with `admin_invitations` and `admin_team_audit`, Drizzle schema, shared password policy extracted from local provisioning, `authorizeGlobalAdmin` and `authorizeGlobalAdminMutation`, and sign-in refusing users without a password hash. Route: delegated (several non-trivial files).
- [x] T2 — Hosted bootstrap command: creates one global admin with an activation link only when none is active, refuses otherwise and says why; Jest spec and PostgreSQL e2e; deployment notes and runbook. Route: delegated.
- [ ] T3 — Team API: list members with access and status; invite (event or global scope), regenerate and cancel invitations; all audited. Route: delegated.
- [ ] T4 — Public activation: check an invitation token and set the password; expired, used or cancelled links refused. Route: delegated with T3.
- [ ] T5 — Access changes: change scope, deactivate with reason (revokes sessions now), reactivate; refuse self-deactivation and losing the last active global admin. Route: delegated.
- [ ] T6 — Contract docs: `docs/contracts/admin-auth-boundary.md`, admin runbook and deployment notes. Route: delegated with T5.
- [ ] T7 — Frontend session scope and Equipo page with global-admin-only navigation. Route: delegated.
- [ ] T8 — Agregar administrador form, Invitación creada screen, and Desactivar acceso confirmation. Route: delegated.
- [ ] T9 — Public Activa tu cuenta page (phone-first) with live password rules. Route: delegated.

## Acceptance criteria

See issue #214. Summary: bootstrap is one-time and idempotent; event-scoped admins activate from the link and only see their events; expired, used or cancelled links fail; deactivation signs out at once; the last global admin and self-deactivation are refused; every action is audited; docs describe bootstrap and flow.

## Checks

- Backend: `pnpm --filter @nuestro-breaking/backend lint`, `test`, `test:e2e`.
- Frontend: `pnpm verify:pr`.

## Progress

- 2026-10-11: Explored; D1 and D2 approved by the user; branch `feat/214-01-team-foundation` created.
- 2026-10-11: T1 done in `f7c6d4c` (delegated writer). Migration `0020` (`admin_invitations` with digest-only tokens and the `admin_invitations_open_user_uq` partial index; `admin_team_audit` where `bootstrapped` has no actor, `activated` has the invitee as actor and no session, and every other action needs actor and session), `password-policy.ts` with `failedPasswordRules` and `hashPassword`, and `authorizeGlobalAdmin(Mutation)(request, response)`. Sign-in already refused users without a password hash through the dummy-hash path; `admin-team-foundation.e2e-spec.ts` now proves it. Checks: backend lint passed; `test` 27 suites, 366 passed; `test:e2e` 27 suites, 267 passed after bumping the migration count in `event-activity-foundation` (a later full run had one intermittent failure in `admin-registration-entitlements`, which passed 2/2 in isolation); `pnpm format` clean.
- 2026-10-11: T1 review (medium, `slice_budget_reached`, consent granted): reliability lens approved and acknowledged, boundary advances to `f3c7f90`. Advisory R3-001: `admin_team_audit_session_fk` pins `auth_sessions` rows; no code deletes sessions today (they are only revoked), so no change. Follow-up outside this feature: mutation checks read `AUTH_TRUSTED_ORIGIN` raw while sign-in uses `readTrustedOrigin` (trim and fallback).
- 2026-10-11: T2 done in `8395a58` (delegated writer). `admin:bootstrap` (`scripts/bootstrap-admin.ts`, logic in `identity-access/admin-bootstrap.ts`) reads `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_NAME` and a required `AUTH_TRUSTED_ORIGIN`, takes `pg_advisory_xact_lock`, and issues a 72-hour link (D7). Same pending email reissues the link (old one cancelled, audited as `bootstrapped` with `reissued: true`, since `invitation_regenerated` needs an actor session). Reusing an existing user row clears its password and revokes its open sessions. `created_by_user_id` is NOT NULL, so the bootstrap invitation records the invitee as creator. Runbook `docs/runbooks/admin-bootstrap.md`, linked from `docs/README.md` and ADR 0008. RED observed first (unit spec failed on the missing module). Checks: backend lint passed; `test` 28 suites, 388 passed; `test:e2e` 28 suites, 274 passed (new `admin-bootstrap.e2e-spec.ts`: 7 tests, including a concurrent-run case); `pnpm format` clean.

## Next step

T3.
