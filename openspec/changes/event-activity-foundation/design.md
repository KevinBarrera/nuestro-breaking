# Design: Event Activity Foundation

## Technical Approach

Implement three bounded units: completed WU1 containers/venues (`0001`), WU2-A declarative membership/activity (`0002`), and WU2-B deferred windows/concurrency (`0003`). Drizzle owns tables and generated metadata; committed custom SQL owns triggers. API, UI, seed, identity/auth, lifecycle, audit/outbox, roster/check-in, competition, workshops, payments, legal, November flow, and pilot readiness remain excluded.

## Delivery and Authority

Canonical machine `chain_strategy` is `stacked-to-main`; it is an accepted-domain label, not a PR target. Human routing is `dev`: WU1 is complete on `dev`; WU2-A targets `dev`; WU2-B initially targets the WU2-A branch and, after A merges, rebases/retargets to `dev`. Staging/main promotion is excluded. WU1 actual 294 authored lines, WU2-A and WU2-B cap at 380 each. The completed combined-WU2 settlement was invalidated by independent validation and supplies no WU2-A/B RED/GREEN evidence.

## Architecture Decisions

- **Membership:** `event_venues(organization_id,event_id,venue_id)` uses primary `(event_id,venue_id)` and composite scoped FKs, allowing same-organization venue reuse while rejecting cross-scope attachment.
- **Activities:** UUID identity; non-blank `kind`/`name`; ordered `timestamptz`; composite membership FK; and `ON DELETE/UPDATE NO ACTION`. Overlap has no exclusion constraint.
- **Temporal values:** equivalent explicit offsets compare equally; `events.time_zone` remains the IANA authoring/display zone. PostgreSQL cannot retain lexical offset syntax.
- **Windows:** `0003` supplies two `DEFERRABLE INITIALLY DEFERRED` triggers. They re-read final rows by UUID; activity writes lock their event and event writes scan current activities. Failures are named `23514` errors.

## Files and Boundaries

- **WU1 unchanged:** `schema/{organizations,venues,events}.ts`, `0001_event_containers.sql`, `meta/{_journal,0001_snapshot}.json`, and E2E proof.
- **WU2-A:** `schema/{event-venues,activities}.ts`, `schema/index.ts`, `0002_event_activity_membership.sql`, `meta/{_journal,0002_snapshot}.json`, and E2E cases. Generate SQL/metadata; never hand-edit metadata.
- **WU2-B:** `0003_event_activity_windows.sql`, `meta/_journal.json`, and E2E cases. Custom SQL is migration-authoritative.

## Strict TDD and PG16 Proof

WU2-A first records isolated RED direct-SQL cases for reset/replay `0000→0001→0002`, reuse, scope/unattached rejection, UUID/non-blank/ordered `timestamptz`, equivalent-offset equality with retained event IANA zone, overlap, and `NO ACTION` delete/key-update rejection. Then implement schemas, generate `0002`/metadata, prove green, and refactor.

WU2-B first records independent RED cases for reset/replay `0000→0001→0002→0003`; bounded-event activity INSERT/UPDATE beyond either boundary rejection; exact-boundary success; and unbounded-event acceptance. Deferred final-state cases cover activity update repair, transient invalid insert then delete, event-window restoration, and offending activity update or delete after event-window add/narrow. Every unrepaired counterpart must fail named `23514` at forced constraint check and at commit.

WU2-B also records two independent RED tests for each interleaving. Every client sets `READ COMMITTED`, `lock_timeout='2s'`, `statement_timeout='5s'`, and a 15-second Jest bound; `pg_blocking_pids(waiter_pid)` must contain the expected blocker before release. Activity-first rejects the excluding event update; window-first rejects the excluded activity. `55P03` or timeout fails the test. Only then add `0003` triggers, prove all cases green, and refactor.

Focused PG16: `pnpm --filter @nuestro-breaking/backend test:e2e -- event-activity-foundation.e2e-spec.ts --runInBand`.
Full safety net once per new unit: `pnpm verify:setup && pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand && pnpm format:check`.

## Threat Matrix and Rollback

N/A — no routing, shell, subprocess, VCS/PR automation, executable classification, or process-integration change; `PostgresHarness` is reused.

On an empty undeployed stack, roll back WU2-B trigger SQL/journal, then WU2-A activities/membership/`0002`/metadata/schemas, then WU1 `0001` and container schemas. Deployed/populated environments require forward corrective migrations.
