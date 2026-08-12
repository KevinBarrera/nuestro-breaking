# Tasks: Event Activity Foundation

## Review Workload Forecast

| Field                   | Value                                           |
| ----------------------- | ----------------------------------------------- |
| Estimated changed lines | 695 authored; ~165 generated metadata           |
| 400-line budget risk    | High overall; each work unit ≤400 authored      |
| Chained PRs recommended | Yes                                             |
| Suggested split         | PR 1 container/venue → PR 2 membership/activity |
| Delivery strategy       | auto-chain                                      |
| Chain strategy          | stacked-to-main                                 |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`Focused PG16`: `pnpm --filter @nuestro-breaking/backend test:e2e -- event-activity-foundation.e2e-spec.ts --runInBand`
`Full safety net` (once per work unit): `pnpm verify:setup && pnpm --filter @nuestro-breaking/backend test:e2e -- --runInBand && pnpm --filter @nuestro-breaking/backend lint && pnpm --filter @nuestro-breaking/backend build && pnpm format:check`. It may start bounded services; use native attempt authority and clean up owned processes.

Canonical `stacked-to-main` implementation chain (repository integration target is `dev`; staging/main promotion is out of scope):

```text
work-unit-1 ── PR 1 → dev
work-unit-2 ── PR 2 → work-unit-1 (while stacked) ── after PR 1 merges: rebase/retarget → dev; rerun checks
```

### Suggested Work Units

| Unit                                              | PR chain boundary                                                         | Forecast                        | Tests           | Runtime harness                                              | Rollback boundary                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1. Container and venue scope                      | PR 1 → `dev`; ends at `0001_event_containers.sql`.                        | ~330 authored / ~65 generated.  | Commands above. | `PostgresHarness` reset/replay `0000→0001` on `postgres:16`. | Revert `organizations`, `venues`, `events`, `0001`, and metadata on empty stacks.               |
| 2. Event venue membership and activity scheduling | PR 2 → PR 1 while stacked; then rebase/retarget → `dev` and rerun checks. | ~365 authored / ~100 generated. | Commands above. | Two PG16 clients exercise deferred triggers.                 | Revert `activities`, `event_venues`, `0002`, metadata before PR 1; forward-migrate if deployed. |

Strict TDD: record each RED failure before its GREEN change, then refactor only with green focused tests.

## Phase 1: Container and Venue Scope (Work Unit 1 / PR 1)

- [x] 1.1 **RED** — Create `apps/backend/test/event-activity-foundation.e2e-spec.ts`: reset/replay; no-user-FK catalog; unbounded event; reject partial/unordered windows and invalid zones; accept `America/Bogota`/`US/Eastern`.
- [x] 1.2 **IMPLEMENT** — Create `apps/backend/src/database/schema/{organizations,venues,events}.ts`; export `schema/index.ts`; add UUIDs, non-blank checks, scoped uniques, optional ordered windows, `NO ACTION` FKs, and no user ownership.
- [x] 1.3 **GREEN** — Generate `apps/backend/drizzle/0001_event_containers.sql` and `apps/backend/drizzle/meta/{_journal.json,0001_snapshot.json}`; add `assert_event_time_zone` / `events_time_zone_ck` after `0000_unknown_ultimates`.
- [x] 1.4 **REFACTOR** — Run focused PG16 then safety net; separately review migration SQL and generated metadata, never hand-edit metadata, and preserve custom SQL later.

## Phase 2: Membership and Activity Scheduling (Work Unit 2 / PR 2)

- [ ] 2.1 **RED** — Extend `apps/backend/test/event-activity-foundation.e2e-spec.ts`: venue reuse; activity UUID/kind/name/interval validation; equivalent-offset activity equality and retained IANA zone; reject cross-scope/unattached placement; boundaries, updates, deferred repair and forced-check/commit `23514`; allow overlap.
- [ ] 2.2 **RED** — Add two-client barrier tests with `lock_timeout='2s'`, `statement_timeout='5s'`, and Jest bounds for both documented interleavings; assert wait-before-release, completion-after-release, and treat `55P03` as failure.
- [ ] 2.3 **IMPLEMENT** — Create `apps/backend/src/database/schema/{event-venues,activities}.ts`; export `schema/index.ts`; require activity UUID identity, non-blank kind/name checks, and `timestamptz` start/end; generate `0002_event_activity_scheduling.sql` and `meta/0002_snapshot.json` with scoped composite FKs, ordered intervals, and `NO ACTION` deletes.
- [ ] 2.4 **GREEN** — In `apps/backend/drizzle/0002_event_activity_scheduling.sql`, add deferred `assert_activity_within_event_window` / `activities_event_window_ck` and `assert_event_window_contains_activities` / `events_activities_window_ck`; lock/re-read UUIDs; raise named `23514`.
- [ ] 2.5 **REFACTOR** — Re-run focused PG16 and safety net; independently review metadata and confirm no API, UI, seed, identity/auth, lifecycle, audit/outbox, roster, scoring, workshop, payment, legal, November-flow, or pilot-readiness scope.
