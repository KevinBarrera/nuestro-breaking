# Apply Progress: Event Activity Foundation

- **Change:** `event-activity-foundation`
- **Mode:** Strict TDD
- **Work units:** WU1 complete; WU2-A declarative membership/activity not started; WU2-B deferred windows/concurrency not started.
- **Machine chain strategy:** `stacked-to-main` is the accepted canonical domain value, not a PR target.
- **Human delivery:** immediate target `dev`; WU2-A targets `dev`; WU2-B initially targets the WU2-A branch then rebases/retargets to `dev`; staging/main promotion excluded.
- **Evidence revision:** 6 — planning correction.

## Cumulative Task Progress

- [x] 1.1 RED — Direct PG16 proof covers reset/replay, catalog-backed zones, no-user-FK catalog, and valid/invalid event windows.
- [x] 1.2 IMPLEMENT — Drizzle organization, venue, and event schemas plus exports.
- [x] 1.3 GREEN — Generated `0001_event_containers`/metadata and migration-authoritative timezone trigger SQL.
- [x] 1.4 REFACTOR — Focused PG16, one full safety net, direct backend E2E, formatting, and diff check passed.
- [ ] 2.1–2.4 WU2-A — Reset to planned; fresh RED → IMPLEMENT → GREEN → REFACTOR evidence is required.
- [ ] 3.1–3.8 WU2-B — Reset to planned; fresh RED → IMPLEMENT → GREEN → REFACTOR evidence is required.

## WU1 Evidence (Unchanged)

Focused PG16 passed 1 suite/8 tests with reset/replay `0000→0001`; `pnpm verify:setup`, direct backend E2E, `pnpm format:check`, and `git diff --check` passed. WU1 authored diff was 294 additions/0 deletions; generated SQL/metadata was 312 additions.

## Invalidated Historical Combined-WU2 Evidence

The prior combined WU2 attempt and parent native settlement completed historically, but independent validation invalidated adequacy. It completes no current checkbox and supplies no WU2-A/B RED evidence. Missing proof included independent concurrency REDs, final-state update/delete repairs, event-window add/narrow repair/failure, explicit `READ COMMITTED`/expected-blocker `pg_blocking_pids` with bounded timeouts, and adequate equivalent-offset equality. This split supersedes stale authority/settlement prose without altering WU1.

## Planned Verification and Rollback

WU2-A must prove replay `0000→0001→0002`, equivalent-offset equality, and retained event IANA zone. WU2-B must prove replay through `0003`, INSERT/UPDATE containment on both boundaries, exact-boundary success, unbounded-event acceptance, every named deferred repair, and forced-check/commit `23514` for every unrepaired variant.

Each new unit runs focused PG16 plus exactly one full safety net: `pnpm verify:setup && pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand && pnpm format:check`. WU2-A is capped at 380 authored/~320 generated; WU2-B at 380/~8. Empty-stack rollback is WU2-B → WU2-A → WU1; deployed/populated environments require forward corrective migrations.

## Scope

No product code, GitHub, branch, commit, push, settlement, or excluded product behavior occurred in this planning correction.
