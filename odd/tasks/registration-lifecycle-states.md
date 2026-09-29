# Registration lifecycle states

## Tracking

- GitHub issue: #61 — Define registration lifecycle states
- Branch: `feat/61-registration-lifecycle-states`
- Follows: #62 — Model participant identity and event activity registration

## Goal

Make event registration lifecycle states explicit before payment, admin cash registration, and check-in workflows are built.

## Tasks

- [x] Map existing registration schema, migration, and MVP requirements.
- [x] Add RED PostgreSQL e2e coverage for registration lifecycle defaults and guards.
- [x] Implement lifecycle persistence, constraints, and documentation.
- [x] Verify focused backend checks and repository formatting.
- [x] Prepare delivery summary.

## Constraints

- Keep this slice focused on lifecycle state definition and persistence.
- Do not implement public registration UI/API, payment provider integration, cash-handling UI, check-in, exports, or authorization policy.
- A registration must not become confirmed merely because a buyer returns from a payment redirect.
- Confirmation must require an explicit source representing either approved payment or authorized admin cash registration.
- Invalid status values and inconsistent confirmation metadata must be rejected at the database boundary.
- Preserve existing participant, event registration, activity registration, and folio constraints.

## Proposed lifecycle

- `pending_payment`: default state for a newly created event registration that is not yet confirmed.
- `confirmed`: registration is valid for attendance/check-in because an explicit confirmation source exists.
- `voided`: registration is no longer valid; detailed cancellation/refund policy is deferred.

## Proposed confirmation sources

- `approved_payment`: future payment webhook/settlement path.
- `admin_cash`: future authorized in-person cash path.

## Evidence

- Issue #61 acceptance criteria require explicit states, no redirect-only confirmation, approved-payment and admin-cash confirmation paths, and invalid/duplicate transitions rejected or clearly handled.
- `docs/product/november-2026-mvp-proposal.md` says an inscription remains pending when payment is not approved and becomes confirmed only after approved payment; authorized staff can register cash.
- Existing `event_registrations` persistence has no lifecycle state yet.
- Scout recommended keeping payment integration, cash UI, authorization, check-in, exports, refunds, and audit trail out of this slice.
- Added `0006_registration_lifecycle_states.sql`: existing rows default to `pending_payment`; status and source values are checked, while confirmation source and timestamp must both be present only for `confirmed`. `voided` currently has neither. Schema and migration agree; existing unique and same-event constraints remain unchanged.
- RED: `corepack pnpm --filter @nuestro-breaking/backend test:e2e -- participant-registration.e2e-spec.ts --runInBand` failed on `column "status" does not exist` (1 failed, 3 passed) before migration/schema changes.
- GREEN: same focused e2e command passed (4/4) after migration and test adjustment; negative INSERT and UPDATE cases reject inconsistent metadata.
- `corepack pnpm --filter @nuestro-breaking/backend lint`, `corepack pnpm --filter @nuestro-breaking/backend exec tsc --noEmit -p tsconfig.json`, and scoped `corepack pnpm exec prettier --check` passed.
- CI caught the migration replay assertion in `event-activity-foundation.e2e-spec.ts` still expecting six migrations; updated it to seven for `0006_registration_lifecycle_states.sql`.
- The suggested `corepack pnpm --filter @nuestro-breaking/backend test -- participant-registration.e2e-spec.ts --runInBand` finds no tests: the default Jest configuration searches `src` for `.spec.ts`; the e2e configuration is required.
- This slice validates row invariants, not transition history or actor authority. Source attribution is supplied by future trusted workflows; no redirect, payment, cash, refund, or check-in behavior is implemented.
