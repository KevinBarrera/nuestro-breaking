# Admin manual registration and cash payment

## Tracking

- GitHub issue: #103 — Add authorized manual registration and cash-payment recording
- Branch: `feat/103-admin-manual-registration-cash`
- Follows: #63 admin registration operations scope, #101 audit/correction policy, #102 admin registration search, #61 registration lifecycle states, #62 participant registration model, and admin auth boundary work.

## Goal

Add protected backend commands that let authorized event admins create manual registrations in `pending_payment` and separately confirm in-person cash payments with durable atomic operation audit.

## Tasks

- [x] Review issue #103, admin registration contracts, and current backend/test seams.
- [x] Add RED PostgreSQL-backed e2e coverage for manual registration and cash confirmation.
- [x] Implement operation audit persistence needed by accepted manual/cash mutations.
- [x] Implement authorized manual registration creation with duplicate and validation guards.
- [x] Implement authorized cash confirmation with amount-required and lifecycle guards.
- [x] Verify focused backend checks and repository formatting.
- [x] Run independent verification and prepare delivery summary.

## Constraints

- Only event admins may create manual registrations or confirm cash payments; judges must be rejected.
- Require full name and phone for manual registration; email is optional.
- Block exact same-event duplicates by phone, and by email when email is supplied.
- Manual registrations start as `pending_payment`; cash confirmation is a separate trusted backend action.
- Cash confirmation requires an amount and may include optional reference, note, or receipt metadata.
- Persist each accepted registration/payment mutation and its operation audit fact atomically in one database transaction.
- Reject unauthenticated, inactive-session, judge, wrong-event, duplicate, invalid-input, and invalid-lifecycle attempts without partial durable writes.
- Do not mutate shared participant identity as an unnecessary side effect.
- Do not implement Mercado Pago, refunds/reconciliation/fiscal flows, broad correction/void, check-in, exports, offline sync, frontend UI, or audit-reader UI/API.

## Evidence

- Issue #103 is open and labeled `status:approved`, `area:backend`, `area:admin`, `risk:high`, and `mvp:registration`.
- `docs/contracts/admin-registration-operations.md` defines manual registration and cash confirmation as guarded admin operations with explicit server-side confirmation and atomic audit.
- `docs/contracts/admin-registration-audit-policy.md` requires accepted material operations to append immutable facts in the same transaction as the authoritative mutation.
- Initial branch created from `dev`: `feat/103-admin-manual-registration-cash`.
- RED: `corepack pnpm --filter @nuestro-breaking/backend test:e2e --runInBand admin-manual-registration.e2e-spec.ts` — 4 tests failed as expected (POST routes returned 404 before implementation).
- GREEN: same command — 5 PostgreSQL-backed e2e tests passed (after fixing a PostgreSQL parameter cast and a JSONB null representation; later added rollback/immutability checks).
- `corepack pnpm --filter @nuestro-breaking/backend lint` — passed after fixing test typings; final run passed.
- Follow-up RED: added missing Origin/CSRF coverage after independent verification found a blocker; missing Origin returned 201 before the fix.
- Follow-up GREEN: `corepack pnpm --filter @nuestro-breaking/backend test:e2e --runInBand admin-manual-registration.e2e-spec.ts` — 6 PostgreSQL-backed e2e tests passed after enforcing trusted Origin and session-bound CSRF on both mutation routes.
- Final independent verification passed: focused e2e, backend lint, `corepack pnpm format:check`, and `git diff --check`.
- Cash `amount` is positive integer cents; audit captures only scoped identifiers, safe status snapshots, optional bounded cash metadata, and no full request body. Manual creations serialized per event via advisory transaction lock; accepted mutations and audit facts share one transaction.
