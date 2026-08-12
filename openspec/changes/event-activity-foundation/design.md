# Design: Event Activity Foundation

## Technical Approach

Implement `event-activity-persistence` in two stacked-to-main database slices. Drizzle owns tables; migrations add PostgreSQL triggers. Excluded: API, UI, seed, user/identity ownership, auth/session, lifecycle/publication, audit/outbox, roster/check-in, competition categories/stages/scoring, workshops, payments, legal claims, November-flow, and pilot-readiness.

## Architecture Decisions

| Decision                 | Choice and rationale                                                                                                                                                                                                                                                                                                     | Rejected alternative                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Ownership and membership | Organizations own reusable venues/events; `event_venues` attaches them. This preserves reuse and proves scope without user ownership.                                                                                                                                                                                    | Event-owned venues duplicate locations.                                       |
| Temporal model           | Store `timestamptz`; retain required `events.time_zone`, matching PG16 `pg_timezone_names`, for authoring/display. Equivalent explicit offsets normalize equally; PostgreSQL loses input syntax after coercion, so lexical validation belongs to a future API if required.                                               | Local timestamps lose instant or zone intent.                                 |
| Window enforcement       | Use two `DEFERRABLE INITIALLY DEFERRED` row constraint triggers: activity writes validate the current event window, and event-window updates scan current activities. Cross-table rules cannot be expressed safely by `CHECK`; both directions prevent invalid window shrinkage and permit transaction-local reordering. | Application checks race; an activity-only trigger misses event edits.         |
| Extensibility            | Future competition/workshop tables reference `activities.id` through explicit cardinality-specific foreign keys.                                                                                                                                                                                                         | Polymorphic `subject_type`/`subject_id` cannot provide referential integrity. |

## Data Model and Flow

```text
organizations ─┬─< venues
               └─< events ─< event_venues >─ venues
                             └─< activities (event_id, venue_id)
```

- UUID identities default to `gen_random_uuid()`; required names/kinds are non-blank. Events and venues expose `UNIQUE (organization_id,id)`.
- `event_venues(organization_id,event_id,venue_id)` references both scoped targets and has `PRIMARY KEY (event_id,venue_id)`; `activities(event_id,venue_id)` references that membership. Activity organization remains derivable.
- Windows are both null or ordered; activity intervals are ordered. Present windows use inclusive containment at both boundaries. Null windows permit any valid interval; overlaps remain allowed. All foreign keys use `ON DELETE NO ACTION`.

## Concurrency Contract

The activity trigger re-reads and locks its event `FOR SHARE`; event updates already lock that row. Deferred functions query final rows by UUID, not queued `NEW` values.

| Interleaving                                              | Expected result                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Activity validates first, then a window update waits      | Activity commits; updater continues, sees it, and an excluding window fails `23514`.     |
| Window update locks first, then activity validation waits | Update commits; activity re-reads the new window and an excluded activity fails `23514`. |

PG16 tests use two clients, barriers, `lock_timeout='2s'`, `statement_timeout='5s'`, and Jest bounds. They assert waiting before release and completion afterward; `55P03` is test failure, not domain behavior.

## Drizzle / SQL Boundary and Files

| File                                                                                        | Action          | Responsibility                                                              |
| ------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| `apps/backend/src/database/schema/{organizations,venues,events,event-venues,activities}.ts` | Create          | Tables and Drizzle-representable keys/checks.                               |
| `apps/backend/src/database/schema/index.ts`                                                 | Modify          | Export schemas.                                                             |
| `apps/backend/drizzle/0001_event_containers.sql`                                            | Generate/extend | Organizations, venues, events, then zone validation.                        |
| `apps/backend/drizzle/0002_event_activity_scheduling.sql`                                   | Generate/extend | Membership, activities, deferred containment.                               |
| `apps/backend/drizzle/meta/{_journal.json,0001_snapshot.json,0002_snapshot.json}`           | Generate        | Drizzle history; never hand-edit and report separately from authored lines. |
| `apps/backend/test/event-activity-foundation.e2e-spec.ts`                                   | Create          | Direct-SQL PG16 contract proof.                                             |

Use snake_case names ending `_pk`, `_uq`, `_fk`, or `_ck`. Function/trigger pairs are `assert_event_time_zone`/`events_time_zone_ck`, `assert_activity_within_event_window`/`activities_event_window_ck`, and `assert_event_window_contains_activities`/`events_activities_window_ck`. The latter two are `DEFERRABLE INITIALLY DEFERRED`. Native constraints retain `23503`/`23505`/`23514`; triggers raise `23514` with their name. Deferred failures surface at forced check or commit and abort the transaction.

Drizzle metadata describes declarative schema only. Committed SQL is authoritative for custom triggers; later migrations preserve or explicitly replace them rather than expecting `db:generate` to diff them.

## Testing Strategy

| Slice                             | RED-to-green PG16 proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: container/venue scope          | Apply/reset/replay `0000→0001` to empty PG16; inspect catalogs for no user ownership; test absent/partial/unordered windows; accept canonical `America/Bogota` and Link alias `US/Eastern`; reject an invalid zone.                                                                                                                                                                                                                                                                                                                      |
| 2: membership/activity scheduling | Apply/reset/replay complete `0000→0001→0002`; reuse one venue across two same-organization events; persist equivalent explicit-offset activity instants and prove equality while retaining the event IANA zone; reject cross-scope membership/unattached venues/bad intervals; accept exact boundaries and reject beyond each boundary on activity insert/update; reject event-window addition/narrowing; prove deferred repair and forced-check/commit failure; prove both concurrency interleavings and same-event/same-venue overlap. |

Reuse `PostgresHarness` unchanged with `postgres:16`; run the focused file and full backend E2E suite. Slice 1 lands before Slice 2; each carries its RED-to-green proof and stays below 400 authored lines.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable classification, or process-integration change; the harness is reused.

## Migration / Rollout

Migrations are additive and ordered after `0000_unknown_ultimates`. On an undeployed/empty stack, revert Slice 2 objects before Slice 1. Once deployed or populated, never rewrite SQL or metadata: ship a forward corrective migration. Destructive rollback drops window triggers/functions, activities, membership, the zone trigger/function, events, venues, then organizations; export dependent data first.

## Open Questions

None.
