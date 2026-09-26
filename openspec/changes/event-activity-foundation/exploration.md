## Exploration: event-activity-foundation

### Current State

`dev` contains the NestJS database boundary and the reusable PostgreSQL 16 `PostgresHarness`, but no organization, venue, event, or activity product module. The four related implementation PRs (#32, #33, #36, and #37) are now closed and unmerged; their branch commits are historical prior art, not current approved code. Their older delivery-ledger wording is therefore historical and must not be treated as current `dev` behavior.

The November pilot brief confirms multi-day, potentially multi-venue events with simultaneous activities, but leaves competition rules, check-in meaning, publication, and participant data decisions unresolved. This change can establish neutral scheduling persistence without deciding any of them.

### Affected Areas

- `apps/backend/src/database/schema/` — future Drizzle schemas for organization, organization-owned venue, event container, event-venue membership, and activity.
- `apps/backend/drizzle/` — additive migration and generated metadata; it must be exercised by the committed migration sequence.
- `apps/backend/test/support/postgres-harness.ts` — reuse unchanged for real PostgreSQL 16 start, reset, migration, and cleanup.
- `apps/backend/test/event-activity-foundation.e2e-spec.ts` — future PG16 proof for scope, time, window, and simultaneous-activity invariants.
- `openspec/changes/event-activity-foundation/` — successor planning artifacts only; `breaking-event-system-foundation` remains immutable prior-art evidence.

### Approaches

1. **Organization venues with explicit event-venue membership** — Organizations own reusable venues; an event attaches permitted venues through an `event_venues` association, and each activity references its event plus an attached venue.
   - Pros: Preserves the organization/design-partner boundary; supports multi-venue and recurring events without duplicating venue records; composite foreign keys can prove that an activity venue belongs to its event and organization; leaves room for future event-specific venue details.
   - Cons: Requires a bridge table, composite scope constraints, and more focused migration tests.
   - Effort: Medium.

2. **Event-owned venues with direct activity references** — A venue belongs to exactly one event and activities reference that venue directly.
   - Pros: Fewer tables and simple foreign keys.
   - Cons: Duplicates a physical venue across events, weakens organization-level venue ownership, and makes future reuse or event-specific attachment rules costly to recover.
   - Effort: Low initially; Medium-to-High to correct later.

### Recommendation

Use **organization venues with explicit event-venue membership**. This is the smallest model that expresses the confirmed operating reality without importing organizer identity, publication, or competition behavior.

| Concept      | Recommended foundation contract                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization | Operating and design-partner boundary; it owns venue inventory and events. It has no implied user ownership relationship.                                                                                                                                                                                                                                                           |
| Venue        | `organization_id`-scoped reusable physical/location record. Event use is explicit through `event_venues`, not an `events.venue_id` shortcut.                                                                                                                                                                                                                                        |
| Event        | UUID identity, `organization_id`, name, mandatory IANA display/authoring time zone, and an optional overall `[window_starts_at, window_ends_at)` pair. The event is a multi-day container, not one scheduled venue occurrence.                                                                                                                                                      |
| Event window | Both endpoints are absent or both present; a present window has `start < end`. Activities must lie wholly within a present window. PostgreSQL cannot express the cross-table rule with a plain `CHECK`, so the persistence slice should use and PG16-test a constraint trigger for activity writes and event-window changes. An absent window permits valid activities at any time. |
| Activity     | UUID identity; explicit `event_id`, attached `venue_id`, neutral non-empty `kind` and `name`, and `starts_at`/`ends_at` instants with `start < end`. Name is not a natural key: repeated or renamed activities remain valid.                                                                                                                                                        |
| Time         | Persist instants as `timestamp with time zone`; accept timezone-qualified input and render/author in the event's IANA zone. Do not store local wall-clock timestamps, assume UTC presentation, or use string slicing for display.                                                                                                                                                   |
| Simultaneity | Allow overlapping activities. The model supports parallel work at different venues and intentionally does not impose a same-venue exclusion rule: a venue can denote a building or a room, and capacity/conflict policy is not yet known.                                                                                                                                           |
| Future links | A future workshop or competition context owns an explicit foreign key to activity when its confirmed rules need one. Do not add `subject_type`/`subject_id`, subtype columns, scoring fields, or a universal workflow engine now. The later context decides the required cardinality.                                                                                               |

The database shape should use `event_venues(organization_id, event_id, venue_id)` with composite foreign keys to organization-scoped event and venue rows, plus a unique `(event_id, venue_id)` target for activities. An activity's `(event_id, venue_id)` reference then proves that the venue is attached to that event. This keeps `organization_id` implicit-but-derivable for activities while retaining their mandatory explicit event scope.

**Delivery slices (stacked to `main`, each under 400 authored changed lines):**

1. **Container and venue scope** — schemas/migration for organization-owned venues and events without `organizerUserId`; PG16 proof for cross-organization venue rejection, optional valid event windows, time-zone-aware instants, reset, and migration replay. Generated Drizzle metadata travels with the migration and is reported separately from authored lines.
2. **Event activity scheduling** — `event_venues` and activities, window constraint trigger, and PG16 proof for activity identity, attached-venue scope, invalid intervals, window containment on both activity and event-window changes, and permitted simultaneous activities.

Neither slice needs an HTTP API, local seed, frontend page, identity/authentication, lifecycle/publication, audit/outbox, roster/check-in, payments, or competition behavior.

**Reusable prior art, not code to copy wholesale:**

- Reuse the committed `apps/backend/test/support/postgres-harness.ts` lifecycle and the direct-SQL PG16 E2E pattern from #32 for migration/reset/isolation and SQL constraint assertions.
- Reuse the #32 organization-scoped composite-FK testing idea, adapting it to event-venue membership rather than an event's mandatory venue.
- Reuse #33's module-owned repository and explicit local-seed safety concepts only if a later approved read/demo slice needs them; neither is a prerequisite here.
- Reuse #36's accessible loading/error/keyboard test discipline only if a later UI is authorized.

**Prior art that must not be copied:** `events.organizer_user_id`, mandatory `events.venue_id` and event-level schedule, the #37 draft/published/closed lifecycle and trusted-actor publication logic, fixed local organization IDs as a product boundary, the hard-coded frontend organization selection, UTC string slicing, and all accreditation, scoring, category/stage, roster, check-in, audit/outbox, payment, or publication assumptions.

### Risks

- The pilot brief remains DRAFT; category/workshop linkage, room semantics, and policy for same-venue conflicts must remain deferred rather than encoded as activity behavior.
- Event-window containment needs a two-direction PostgreSQL constraint trigger and migration proof; a one-sided activity-only check permits invalid window edits.
- The older stabilization artifacts describe a former open stack, while current GitHub evidence shows #32/#33/#36/#37 closed and unmerged. Future planning must use current `dev` and GitHub state, not those delivery claims.
- A migration plus PG16 proof may approach the review budget once generated Drizzle metadata is included; retain the two-slice chain and disclose generated versus authored line counts.

### Ready for Proposal

Yes. Propose a persistence-only successor with the two stacked slices above. The proposal should state that organization is the operating/design-partner boundary, event is a multi-day container, and activity is neutral schedule data; it must explicitly exclude user ownership, APIs/UI, lifecycle, auth, audit/outbox, roster/check-in, competition rules, payments, and real-pilot claims.
