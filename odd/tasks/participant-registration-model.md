# Participant registration model

## Tracking

- GitHub issue: #62 — Model participant identity and event activity registration
- Branch: `feat/62-participant-registration-model`
- Follows: #92 — Add strict local admin provisioning command

## Goal

Model participant identity and event activity registration persistence without implementing public registration, payments, check-in, or admin/user workflows.

## Tasks

- [x] Map existing backend schema, migration, and test conventions.
- [x] Create approved GitHub issue and ODD tracking.
- [x] Add RED PostgreSQL e2e coverage for participant identity and registration constraints.
- [x] Implement participant, event registration, and activity registration schema/migration.
- [x] Verify focused backend checks and repository formatting.
- [ ] Run RDD review and prepare delivery summary.

## Constraints

- Keep participant identity separate from backend login users.
- Keep event-level registration separate from activity-specific registration.
- Support future lookup by name, email, stage name, or event-scoped folio through stored fields, without implementing search endpoints or normalization policy.
- Do not implement public registration UI/API, payment lifecycle, cash handling, check-in, attendance, exports, or organizer-specific required-field policy.
- Preserve same-event integrity: activity registrations must not link an event registration to an activity from a different event.
- Avoid global uniqueness for participant email until product policy explicitly requires it.

## Proposed model

- `participants`: global participant identity basics (`full_name`, nullable `email`, nullable `stage_name`).
- `event_registrations`: event-scoped enrollment for one participant with nullable event-scoped `folio`.
- `event_activity_registrations`: join between an event registration and an activity, constrained to the same event.

## Evidence

- Read-only mapping found existing schema conventions in `events`, `event_venues`, and `activities`: UUID primary keys, named constraints, composite FKs for event scoping, and direct PostgreSQL e2e constraint tests.
- Issue #62 requires participant identity basics, activity registration separated from raw person data, lookup fields, and flexible organizer-dependent required fields.
- Scout recommendation: keep this as a persistence/model slice only; do not add registration workflow, lookup endpoint, payment, attendance, or check-in behavior.
- RED: focused PostgreSQL e2e ran before implementation; all three cases failed because `participants` did not exist.
- GREEN: the same focused e2e passed (3 tests) after adding participant, event registration, and event-scoped activity registration constraints. Cases cover nullable/repeated email, blank names, event-scoped folios, duplicate enrollment, duplicate activity enrollment, and cross-event inserts/updates.
- Branch-train repair restored the expected migration sequence: `0004_admin_sessions` is preserved from the auth/admin work, and `0005_participant_registration_model` follows it as journal index 5. Like the hand-written `0003`/`0004` migrations, `0005` has no generated snapshot. Updated the existing migration replay assertion to six migrations.
- Verification: focused e2e, backend lint, backend build, and repository `format:check` passed in the worker environment; independent runtime verification is pending in this shell because `pnpm` was initially unavailable on PATH.
