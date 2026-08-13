# Apply Progress: Event Activity Foundation

- **Change:** `event-activity-foundation`
- **Mode:** Strict TDD
- **Work units:** WU1 complete; WU2-A declarative membership/activity complete with fresh independent evidence; WU2-B deferred windows/concurrency not started.
- **Machine chain strategy:** `stacked-to-main` is the accepted canonical domain value, not a PR target.
- **Human delivery:** immediate target `dev`; WU2-A targets `dev`; WU2-B initially targets the WU2-A branch then rebases/retargets to `dev`; staging/main promotion excluded.
- **Parent token:** `sha256:72afea20961dfd6ff3d09f60539111ddbe890ce3f9d0c43baa8f4d476bc7814f`; parent settlement completed for the accounting correction.
- **Evidence revision:** 9 — final WU2-A accounting correction.

## Cumulative Task Progress

- [x] 1.1 RED — Direct PG16 proof covers reset/replay, catalog-backed zones, no-user-FK catalog, and valid/invalid event windows.
- [x] 1.2 IMPLEMENT — Drizzle organization, venue, and event schemas plus exports.
- [x] 1.3 GREEN — Generated `0001_event_containers`/metadata and migration-authoritative timezone trigger SQL.
- [x] 1.4 REFACTOR — Focused PG16, one full safety net, direct backend E2E, formatting, and diff check passed.
- [x] 2.1 RED — Fresh direct-PG16 membership/activity cases failed before `0002` existed.
- [x] 2.2 IMPLEMENT — Added Drizzle event-venue and activity schemas plus exports.
- [x] 2.3 GREEN — Generated `0002_event_activity_membership.sql` and metadata; every WU2-A case passed.
- [x] 2.4 REFACTOR — Kept declarative scope, refined the direct key-update proof, and ran focused PG16 plus one full setup verification.
- [ ] 3.1–3.8 WU2-B — Reset to planned; fresh RED → IMPLEMENT → GREEN → REFACTOR evidence is required.

## WU1 Evidence (Unchanged)

Focused PG16 passed 1 suite/8 tests with reset/replay `0000→0001`; `pnpm verify:setup`, direct backend E2E, `pnpm format:check`, and `git diff --check` passed. WU1 authored diff was 294 additions/0 deletions; generated SQL/metadata was 312 additions.

## Invalidated Historical Combined-WU2 Evidence

The prior combined WU2 attempt and parent native settlement completed historically, but independent validation invalidated adequacy. It completes no current checkbox and supplies no WU2-A/B RED evidence. Missing proof included independent concurrency REDs, final-state update/delete repairs, event-window add/narrow repair/failure, explicit `READ COMMITTED`/expected-blocker `pg_blocking_pids` with bounded timeouts, and adequate equivalent-offset equality. This split supersedes stale authority/settlement prose without altering WU1.

## WU2-A Evidence (Fresh and Independent)

Scope is declarative membership/activity only. `0002` contains tables, constraints, and `NO ACTION` foreign keys; it contains no custom trigger SQL, event-window containment, concurrency code, or WU2-B tests.

### TDD Cycle Evidence

| Task          | Test File                                                 | Layer            | Safety Net                                  | RED                                                                                                                                  | GREEN                                                                                                                                        | TRIANGULATE                                                                                     | REFACTOR                                                                    |
| ------------- | --------------------------------------------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2.1 RED       | `apps/backend/test/event-activity-foundation.e2e-spec.ts` | PG16 integration | ✅ Focused baseline: 1 suite/8 tests passed | ✅ New direct-SQL tests first; exit 1, 1 suite failed, 5 failed/8 passed because migration count was 2 and `event_venues` was absent | ✅ All cases passed after `0002`: 1 suite/13 tests                                                                                           | ✅ Reuse/scope, unattached, blank, unordered/equal, offsets/zone, overlap, and cleanup paths    | ✅ Kept behavioral direct-SQL assertions only                               |
| 2.2 IMPLEMENT | Same                                                      | PG16 integration | ✅ 1 suite/8 tests                          | ✅ Used 2.1's failing suite before adding schemas                                                                                    | ✅ `eventVenues`/`activities` schema implementation plus generated migration produced 1 suite/13 tests                                       | ✅ Composite scope and composite membership FKs exercised distinct rejection paths              | ➖ Structural schema was already minimal                                    |
| 2.3 GREEN     | Same                                                      | PG16 integration | ✅ 1 suite/8 tests                          | ✅ 2.1 failure retained as the production-code gate                                                                                  | ✅ `pnpm exec drizzle-kit generate --config drizzle.config.ts --name event_activity_membership` exit 0; focused PG16 1 suite/13 tests passed | ✅ Generated tables/checks/FKs satisfy all listed WU2-A scenarios                               | ✅ Short FK names prevent PostgreSQL identifier truncation notices          |
| 2.4 REFACTOR  | Same                                                      | PG16 integration | ✅ 1 suite/8 tests                          | ✅ No new production behavior; retained isolated 2.1 RED evidence                                                                    | ✅ Final focused PG16 exit 0: 1 suite/13 tests                                                                                               | ✅ Event-key update and membership delete reject; activity-first cleanup proves the final state | ✅ Prettier retained canonical test layout; no production refactor required |

### Work Unit Evidence

| Evidence                         | Exact result                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command             | `pnpm --filter @nuestro-breaking/backend test:e2e -- event-activity-foundation.e2e-spec.ts --runInBand` → exit 0; 1 suite passed, 13 tests passed, 0 snapshots.                                                                                                                                                                                                                                               |
| Runtime harness command/scenario | Same command → exit 0 against a Testcontainers PostgreSQL 16 instance. `PostgresHarness.reset()` drops the schemas and replays Drizzle `0000→0001→0002`; direct SQL proves venue reuse, scope rejection, unattached rejection, UUID/nonblank/interval checks, offset equality with the retained IANA zone, permitted overlap, `NO ACTION`, activity-first cleanup, and final empty membership/activity state. |
| Full setup verification          | `pnpm verify:setup` → exit 0, run exactly once for WU2-A; formatting, frontend lint/build, backend lint/build, 2 backend unit tests, 16 backend E2E tests, 2 frontend E2E tests, and both local route-health checks passed.                                                                                                                                                                                   |
| Rollback boundary                | Revert only `apps/backend/src/database/schema/{event-venues,activities}.ts`, their `schema/index.ts` exports, `apps/backend/drizzle/0002_event_activity_membership.sql`, `apps/backend/drizzle/meta/{_journal,0002_snapshot}.json`, and WU2-A cases in `apps/backend/test/event-activity-foundation.e2e-spec.ts`. No WU1 behavior or WU2-B trigger/window/concurrency behavior is removed.                    |

### Accounting Correction

WU2-A's final authored candidate is 373 changed lines: 299 product/test additions plus 74 SDD ledger additions/deletions. This remains below the 400-line limit. Generated `0002` output is 460 additions: SQL 24, snapshot 429, and journal 7. WU2-B remains forecast at ≤380 authored/~8 generated.

### Result Contract

- **Artifact scope:** Accounting correction only; no implementation or test bytes changed and no runtime suite was rerun.
- **Static checks:** `pnpm format:check` and `git diff --check` passed.
- **Authority:** Parent settlement completed for the accounting correction; runtime implementation evidence remains unchanged.

## Planned Verification and Rollback

WU2-A proved replay `0000→0001→0002`, equivalent-offset equality, retained event IANA zone, declarative scope, permitted overlap, and `NO ACTION`. WU2-B remains required to prove replay through `0003`, INSERT/UPDATE containment on both boundaries, exact-boundary success, unbounded-event acceptance, every named deferred repair, and forced-check/commit `23514` for every unrepaired variant.

Each new unit runs focused PG16 plus exactly one full safety net: `pnpm verify:setup && pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand && pnpm format:check`. WU2-A ran its `pnpm verify:setup` exactly once. WU2-B remains capped at 380/~8 authored/generated. Empty-stack rollback is WU2-B → WU2-A → WU1; deployed/populated environments require forward corrective migrations.

## Scope

WU2-A product code and PG16 tests were implemented. No GitHub, branch, commit, push, parent-token reacquisition, WU2-B trigger/window/concurrency work, or excluded product behavior occurred. Parent settlements were performed by the orchestrator.
