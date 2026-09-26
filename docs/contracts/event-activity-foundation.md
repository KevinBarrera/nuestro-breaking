# Event and activity foundation contract

This contract explains what the current repository actually guarantees for events, venues, and activities. It supports GitHub issue #60 without treating the November 2026 MVP proposal as approved.

## Current answer

The implemented foundation is a reusable persistence layer for organization-scoped events, reusable venues, and neutral activities:

- An `event` belongs to one organization and keeps an authoring/display time zone.
- A `venue` belongs to one organization and can be attached to multiple events.
- An `activity` belongs to one event and one venue already attached to that event.
- Activity intervals are ordered PostgreSQL `timestamptz` instants; overlapping activities are allowed.
- Product decisions such as registration, payment, check-in, competition rules, activity-specific required fields, and November pilot readiness are not part of this contract.

## Implemented model

| Concept                | Implemented fields                                                   | Current guarantee                                                                                                                 | Evidence                                                                                                      |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Organization           | `id`, `name`                                                         | Organizations exist independently from users; names cannot be blank.                                                              | `apps/backend/src/database/schema/organizations.ts`, `apps/backend/drizzle/0001_event_containers.sql`         |
| Venue                  | `id`, `organization_id`, `name`                                      | A venue belongs to one organization and can be reused across that organization's events.                                          | `apps/backend/src/database/schema/venues.ts`, `apps/backend/test/event-activity-foundation.e2e-spec.ts`       |
| Event                  | `id`, `organization_id`, `name`, `time_zone`, `starts_at`, `ends_at` | An event belongs to one organization, has a PostgreSQL-catalog time zone, and may be unbounded or have a complete ordered window. | `apps/backend/src/database/schema/events.ts`, `apps/backend/drizzle/0001_event_containers.sql`                |
| Event venue membership | `organization_id`, `event_id`, `venue_id`                            | An event can only attach venues from the same organization.                                                                       | `apps/backend/src/database/schema/event-venues.ts`, `apps/backend/drizzle/0002_event_activity_membership.sql` |
| Activity               | `id`, `event_id`, `venue_id`, `kind`, `name`, `starts_at`, `ends_at` | An activity must use an attached event/venue pair, have nonblank kind/name, and have an ordered interval.                         | `apps/backend/src/database/schema/activities.ts`, `apps/backend/drizzle/0002_event_activity_membership.sql`   |

## November MVP mapping

The draft MVP examples can be represented as neutral activities without hard-coding final organizer decisions:

| Draft example               | Current representation                                                                                 | Still configurable or deferred                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Competition or battle       | `activities.kind = 'battle'` or another agreed label; `activities.name` stores display name.           | Final category names, brackets, scoring, judges, and winner logic.                          |
| Workshop                    | `activities.kind = 'workshop'`; venue and interval identify where/when it happens.                     | Instructor metadata, workshop-specific capacity policy, and registration requirements.      |
| General entry or event pass | Representable as a neutral activity if the product chooses to sell it as an activity-like access item. | Whether general access is modeled as an activity, ticket type, or separate product concept. |
| Venue or room               | `venues.name` plus `event_venues` membership.                                                          | Public address, room details, accessibility notes, and event-day signage.                   |
| Date/time                   | Event and activity `timestamptz` intervals with event `time_zone`.                                     | Display formatting and product rules around local date/time entry.                          |

This is enough for foundation work, but it is not approval of the draft MVP proposal.

## Explicitly out of scope

This contract does not define or guarantee:

- attendee or participant registration;
- payment status, cash handling, Mercado Pago behavior, or refunds;
- check-in, attendance, folios, or lookup flows;
- authorization roles or audit trails;
- competition brackets, scoring, judges, winners, or categories;
- public event pages, publication workflow, seed data, or API behavior;
- legal/payment readiness or November pilot readiness.

Those belong to later MVP issues or validation work.

## Known gaps before closing issue #60

| Gap                                                        | Why it matters                                                                                                                                                                                                          | Suggested follow-up                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Event-window containment is not implemented.               | OpenSpec describes a future `0003` migration where activities must fit inside a bounded event window and event windows cannot be narrowed around existing activities. The checked-in migration journal stops at `0002`. | Decide whether #60 requires this before closure, or split it into a focused backend follow-up.               |
| Price display and capacity are not persistence fields yet. | The UI preview shows them as useful planning fields, but the backend activity table does not store them.                                                                                                                | Decide whether they are required for the foundation schema or should remain product/configuration decisions. |
| Activity kind is plain text.                               | This keeps organizer-dependent labels flexible, but does not constrain allowed values.                                                                                                                                  | Keep flexible until organizer/product validation, or introduce controlled values later.                      |
| No API contract exposes this model.                        | The persistence contract exists, but application code cannot yet consume it through a backend endpoint.                                                                                                                 | Handle in a later implementation slice after deciding API boundaries.                                        |

## Acceptance readback for issue #60

| Acceptance criterion                                                               | Current status                                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Event and activity model is documented or implemented.                             | Partially satisfied: implemented in persistence and documented here.                                                               |
| The model supports the draft MVP activity examples.                                | Partially satisfied: neutral activities can represent battle/workshop/general-entry-like examples without final product semantics. |
| Organizer-dependent fields are configurable or deferred behind explicit decisions. | Satisfied in this contract: activity labels remain flexible, and unresolved fields are listed as configurable/deferred.            |

Issue #60 should stay open until the team decides whether the known gaps above are required for closure.
