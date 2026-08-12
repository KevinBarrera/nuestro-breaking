# Tasks: Event Activity Foundation

## Review Workload Forecast

| Field                   | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Estimated changed lines | WU1 294/312; WU2-A actual 373/460; WU2-B ≤380/~8 authored/generated |
| 400-line budget risk    | High overall; each ≤400 authored                                    |
| Chained PRs recommended | Yes                                                                 |
| Suggested split         | WU1 complete → WU2-A declarative → WU2-B enforcement                |
| Delivery strategy       | auto-chain                                                          |
| Chain strategy          | stacked-to-main                                                     |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`stacked-to-main` is a machine value, not a PR target. Immediate: `dev`; WU2-A → `dev`; WU2-B → WU2-A, then rebase/retarget → `dev`; no staging/main promotion.

| Unit | Goal                            | Likely PR           | Focused test command | Runtime harness       | Rollback boundary               |
| ---- | ------------------------------- | ------------------- | -------------------- | --------------------- | ------------------------------- |
| 1    | Container/venue                 | PR 1 → `dev`        | Focused PG16         | Replay `0000→0001`    | Existing WU1 files              |
| 2-A  | Declarative membership/activity | PR 2 → `dev`        | Focused PG16         | Replay `0000→0002`    | `0002`, metadata, schemas/tests |
| 2-B  | Deferred windows/concurrency    | PR 3: WU2-A → `dev` | Focused PG16         | Two PG16 lock clients | `0003`, journal, triggers/tests |

Focused: `pnpm --filter @nuestro-breaking/backend test:e2e -- event-activity-foundation.e2e-spec.ts --runInBand`. Safety net per unit: `pnpm verify:setup && pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand && pnpm format:check`.

**WU2-A accounting (actual):** 373 authored candidate changed lines = 299 product/test additions + 74 SDD ledger additions/deletions. Generated output is 460 additions = SQL 24 + snapshot 429 + journal 7. WU2-B remains forecast at ≤380 authored/~8 generated.

## Phase 1: Container and Venue Scope (WU1 / PR 1)

- [x] 1.1 **RED** — `test/event-activity-foundation.e2e-spec.ts`: replay and container invariants.
- [x] 1.2 **IMPLEMENT** — `schema/{organizations,venues,events}.ts` plus `schema/index.ts`.
- [x] 1.3 **GREEN** — Generate `0001_event_containers.sql`/metadata and zone trigger.
- [x] 1.4 **REFACTOR** — Focused test/safety net; preserve metadata.

## Phase 2: Declarative Membership and Activity (WU2-A / PR 2)

- [x] 2.1 **RED** — Add failing PG16: replay `0000→0001→0002`; reuse/scope/unattached; UUID, non-blank, ordered `timestamptz`; equal offsets/retained IANA zone; overlap; `NO ACTION` delete/key update.
- [x] 2.2 **IMPLEMENT** — Create `schema/{event-venues,activities}.ts` and exports with composite scope/membership FKs, checks, and `NO ACTION` actions.
- [x] 2.3 **GREEN** — Generate `0002_event_activity_membership.sql` and `meta/{_journal,0002_snapshot}.json`; prove every WU2-A RED case passes.
- [x] 2.4 **REFACTOR** — Refactor green WU2-A tests; focused/safety net; review metadata.

## Phase 3: Deferred Windows and Concurrency (WU2-B / PR 3)

- [ ] 3.1 **RED** — Replay `0000→0001→0002→0003`: bounded INSERT/UPDATE beyond either boundary fails; exact boundary succeeds; unbounded event accepts.
- [ ] 3.2 **RED** — Add repairs: activity update; transient invalid insert then delete; event-window restoration; offending activity update/delete after add/narrow.
- [ ] 3.3 **RED** — Prove each unrepaired 3.2 variant fails `23514` at forced check and commit.
- [ ] 3.4 **RED** — Two activity-first interleavings: `READ COMMITTED`, bounded timeouts, expected-blocker `pg_blocking_pids` proof.
- [ ] 3.5 **RED** — Two window-first interleavings with that proof; `55P03` or timeout fails.
- [ ] 3.6 **IMPLEMENT** — Create `0003_event_activity_windows.sql`: deferred UUID re-read/lock activity and event triggers.
- [ ] 3.7 **GREEN** — Prove repairs commit; unrepaired, boundary, and interleaving failures are named `23514`.
- [ ] 3.8 **REFACTOR** — Refactor green WU2-B tests; focused/safety net; review trigger SQL/exclusions.
