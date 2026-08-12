# Apply Progress: Event Activity Foundation

| Field | Value |
| --- | --- |
| Change | `event-activity-foundation` |
| Mode | Strict TDD |
| Work unit | 1 — Container and venue scope |
| Candidate base | Current `dev` |
| Candidate boundary | Organization, venue, and event persistence through `0001_event_containers.sql`; no Work Unit 2 code or artifacts |
**Evidence revision**: 3

## Cumulative Task Progress

- [x] 1.1 RED — Direct PostgreSQL 16 proof covers reset/replay, catalog-backed exact zones, no-user-FK catalog, unbounded and ordered windows, partial/equal/unordered rejection, and invalid zones.
- [x] 1.2 IMPLEMENT — Drizzle organization, venue, and event schemas plus exports.
- [x] 1.3 GREEN — Generated `0001_event_containers` and metadata, then added migration-authoritative timezone trigger SQL.
- [x] 1.4 REFACTOR — Focused PG16, full workspace safety net, direct backend E2E, formatting, and diff check pass.
- [ ] 2.1–2.5 — Not assigned and untouched.

## Candidate Identity and Scope

Implementation candidate, against current `dev`:

- `apps/backend/src/database/schema/{organizations,venues,events}.ts`
- `apps/backend/src/database/schema/index.ts`
- `apps/backend/drizzle/0001_event_containers.sql`
- `apps/backend/drizzle/meta/{_journal.json,0001_snapshot.json}`
- `apps/backend/test/event-activity-foundation.e2e-spec.ts`

The candidate implementation diff hash is `1e0a0278bbd3ec29d70c796e21ecb66a7e3e2e176876ec4f47f442080bb284b7` (SHA-256 of the ordered current-dev diff for those implementation files). No branch, commit, push, or GitHub operation was performed.

## TDD Cycle Evidence

| Task | Layer                           | Safety Net                            | RED                                                                                                                                                                                                                                                                                                | GREEN                                                                                                                     | Triangulation                                                                                                                                                           | Refactor                                                                                          |
| ---- | ------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1.1  | PG16 direct-SQL integration/E2E | N/A — new test                        | Initial command: 5/5 failed because `organizations`, `venues`, and `events` did not exist. Validator correction RED: 2/8 failed because the trigger did not use `pg_catalog.pg_timezone_names` and rewrote `US/Eastern`; the ordered-window assertion also exposed a driver return-shape mismatch. | Focused command: 8/8 passed after exact catalog validation, hardcoded rewrite removal, and corrected SQL-value assertion. | Reset/replay, canonical `America/Bogota`, actual catalog alias `Etc/UTC`, invalid zone, unbounded, bounded, partial, equal, and unordered windows cover distinct paths. | Test checks catalog contents and trigger definition; window success uses direct persisted values. |
| 1.2  | PG16 direct-SQL integration/E2E | N/A — new schemas                     | Same initial missing-table RED.                                                                                                                                                                                                                                                                    | Schema compiles and PG16 creates the three tables with scoped FKs and checks.                                             | Catalog, UUID, no-user-FK, and temporal checks exercise separate declarative constraints.                                                                               | Declarative schema remains minimal.                                                               |
| 1.3  | PG16 direct-SQL integration/E2E | N/A — new migration                   | Same initial missing-table RED; validator correction RED confirmed the prohibited rewrite.                                                                                                                                                                                                         | Focused 8/8 passes with `pg_catalog.pg_timezone_names`, direct exact-name matching, and named failures.                   | Exact known catalog names are accepted; invalid zone returns `23514/events_time_zone_ck`; invalid windows return `23514/events_window_ck`.                              | Custom trigger remains migration-authoritative; Drizzle metadata was not hand-edited.             |
| 1.4  | PG16 direct-SQL integration/E2E | Focused 8/8 baseline after correction | N/A — verification/refactor task.                                                                                                                                                                                                                                                                  | `verify:setup`, direct backend E2E, format, and diff check pass.                                                          | Full workspace, direct backend E2E, and focused database harness cover distinct boundaries.                                                                             | Canonical Prettier is clean after artifact creation.                                              |

## Exact Verification Results

| Command                                                                                                 | Result                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @nuestro-breaking/backend test:e2e -- event-activity-foundation.e2e-spec.ts --runInBand` | Exit 0; 1 suite, 8 tests passed. `PostgresHarness` starts `postgres:16`, applies and reset-replays `0000→0001`, then stops its owned client/container in `afterAll`.                                                                         |
| `pnpm verify:setup`                                                                                     | Exit 0; workspace format, frontend lint/build, backend lint/build/unit (2/2), backend E2E (3 suites, 11 tests), frontend Playwright (2/2), and local backend/frontend health checks passed. Runner-owned backend/frontend processes stopped. |
| `pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand`           | Exit 0; 3 suites, 11 tests passed. Used because the package-wrapper form routes a standalone `--runInBand` as a Jest test pattern.                                                                                                           |
| `pnpm format:check`                                                                                     | Exit 0; all matched files use canonical Prettier formatting.                                                                                                                                                                                 |
| `git diff --check`                                                                                      | Exit 0; no whitespace errors.                                                                                                                                                                                                                |

## SQLSTATE and Catalog Evidence

- `pg_catalog.pg_timezone_names` contains `America/Bogota` and `Etc/UTC` in the PostgreSQL 16 harness image; it does not contain `US/Eastern`.
- `assert_event_time_zone` references qualified `pg_catalog.pg_timezone_names` and compares `name = NEW.time_zone` without a hardcoded alias rewrite.
- Invalid timezone: SQLSTATE `23514`, constraint `events_time_zone_ck`.
- Partial, equal-boundary, and unordered windows: SQLSTATE `23514`, constraint `events_window_ck`.
- User ownership foreign-key catalog count: `0`.

## Diff Accounting

- Authored implementation candidate: 294 additions, 0 deletions — under the 400-line work-unit budget.
  - Schemas and exports: 84 lines.
  - PG16 test: 184 lines.
  - Custom migration trigger SQL: 26 lines.
- Generated declarative migration SQL: 38 additions.
- Generated Drizzle metadata: 274 additions (`_journal.json`: 7; `0001_snapshot.json`: 267).
- Planning and this evidence artifact are previously delivered/change-control text and are excluded from the implementation PR budget.

## Rollback and Cleanup

On an empty undeployed stack, remove `0001_event_containers.sql`, its journal entry and snapshot, the three schema files and exports, and the focused PG16 test. For deployed or populated environments, create a forward corrective migration instead of rewriting migration history.

`verify:setup` reused the persistent Compose `postgres` service and did not stop it. It stopped only its runner-owned backend/frontend processes. The focused harness stopped its Testcontainers PostgreSQL 16 container. No other owned processes or containers remain.

This correction attempt ran `pnpm verify:setup` twice: once before materializing this final evidence artifact and once as the final post-artifact gate. Both runs passed; the second run is the recorded final result above.

## Deviation and Settlement Evidence

The earlier requested `US/Eastern` name is absent from this PostgreSQL 16 image's `pg_catalog.pg_timezone_names`; planning and tests now use the actual catalog alias `Etc/UTC`, preserving the exact-name validation requirement without rewriting input. No Work Unit 2 behavior was implemented.

- Parent authority: `sha256:7c28db6d53fd5c354878dc0c5c07662e552ddf00eee5998ea37c4f4a45077aa1`
- Work unit: `WU1-container-venue-scope`
- Parent settles; this executor did not reacquire authority or settle it.
