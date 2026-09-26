# Event window containment

## Tracking

- GitHub issue: #60 — Define event and activity foundation
- Branch: `feat/60-event-window-containment`
- Related auth/access issue: #78 — Define minimal admin authentication and access boundary

## Goal

Enforce the remaining event/activity foundation invariant: when an event has a bounded window, every activity for that event must fit inside it, and event windows cannot be narrowed around existing activities.

## Tasks

- [x] Create the separate auth/access boundary issue (#78).
- [x] Explore current schema, migrations, tests, and documented gap.
- [x] Add database enforcement for event/activity window containment.
- [x] Verify with focused PostgreSQL e2e coverage.
- [x] Commit work unit after approval.

## Constraints

- Preserve unbounded event behavior.
- Preserve activity overlap allowance.
- Do not add registration, payment, check-in, auth, scoring, publication, CRUD, or pilot-readiness semantics.
- Do not invent controlled activity kinds or capacity/price fields.
- Keep enforcement in the database so backend and future clients share the same invariant.

## Evidence

- Separate auth/access issue created: #78 `https://github.com/KevinBarrera/nuestro-breaking/issues/78`.
- Read-only mapping found that `events_window_ck` and `activities_window_ck` exist, but no cross-table containment exists. A new migration is required because this is a database invariant.
- Strict TDD RED: focused PostgreSQL e2e had 3 expected failures before the migration (migration count and both containment behaviors); GREEN: 15/15 passed after adding trigger-backed migration `0003_event_window_containment`.
- The activity trigger locks the event row during containment checks, and the event trigger rejects bounds that exclude existing activities. Unbounded events and activity overlaps remain allowed.
- Final verification: `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json event-activity-foundation.e2e-spec.ts --runInBand` passed (15 tests); `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand` passed (20 tests); `corepack pnpm --filter @nuestro-breaking/backend lint` passed; `corepack pnpm format:check` passed; `git diff --check` passed. Node engine warning persisted: repository wants Node v24.18.1, host uses v24.19.0.
- Risk: concurrent transaction behavior was not separately stress-tested; coverage verifies the normal PostgreSQL invariant path through the migration chain.
- Work-unit commit: `29cbb4d` — `feat(database): enforce event activity window containment`.
