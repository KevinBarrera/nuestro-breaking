# Event and activity foundation contract

This contract explains what the current repository actually guarantees for events, venues, and activities. It supports GitHub issue #60 without treating the November 2026 MVP proposal as approved.

## Current answer

The implemented foundation is a reusable persistence layer for organization-scoped events, reusable venues, and neutral activities:

- An `event` belongs to one organization and keeps an authoring/display time zone.
- A `venue` belongs to one organization and can be attached to multiple events.
- An `activity` belongs to one event and one venue already attached to that event.
- Activity intervals are ordered PostgreSQL `timestamptz` instants; bounded events contain their activities, and overlapping activities are allowed.
- A read-only foundation API and first admin frontend route expose this model without adding workflows.
- Product decisions such as registration, payment, check-in, competition rules, activity-specific required fields, authorization mechanics, and November pilot readiness are not part of this contract.

## Implemented model

| Concept                | Implemented fields                                                   | Current guarantee                                                                                                                                                  | Evidence                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization           | `id`, `name`                                                         | Organizations exist independently from users; names cannot be blank.                                                                                               | `apps/backend/src/database/schema/organizations.ts`, `apps/backend/drizzle/0001_event_containers.sql`                                                                 |
| Venue                  | `id`, `organization_id`, `name`                                      | A venue belongs to one organization and can be reused across that organization's events.                                                                           | `apps/backend/src/database/schema/venues.ts`, `apps/backend/test/event-activity-foundation.e2e-spec.ts`                                                               |
| Event                  | `id`, `organization_id`, `name`, `time_zone`, `starts_at`, `ends_at` | An event belongs to one organization, has a PostgreSQL-catalog time zone, and may be unbounded or have a complete ordered window.                                  | `apps/backend/src/database/schema/events.ts`, `apps/backend/drizzle/0001_event_containers.sql`                                                                        |
| Event venue membership | `organization_id`, `event_id`, `venue_id`                            | An event can only attach venues from the same organization.                                                                                                        | `apps/backend/src/database/schema/event-venues.ts`, `apps/backend/drizzle/0002_event_activity_membership.sql`                                                         |
| Activity               | `id`, `event_id`, `venue_id`, `kind`, `name`, `starts_at`, `ends_at` | An activity must use an attached event/venue pair, have nonblank kind/name, have an ordered interval, and fit within a bounded event window. Overlaps are allowed. | `apps/backend/src/database/schema/activities.ts`, `apps/backend/drizzle/0002_event_activity_membership.sql`, `apps/backend/drizzle/0003_event_window_containment.sql` |

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
- authentication mechanics, authorization roles, or audit trails;
- competition brackets, scoring, judges, winners, or categories;
- public event pages, publication workflow, seed data, or write/API command behavior;
- legal/payment readiness or November pilot readiness.

Those belong to later MVP issues or validation work.

## Remaining deferred decisions after issue #60

| Deferred decision                                          | Why it remains deferred                                                                                                               | Follow-up                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Price display and capacity are not persistence fields yet. | The UI preview and API metadata show them as useful planning fields, but organizer validation has not proven the exact storage model. | Decide in a focused registration/commercial or admin-authoring slice.                     |
| Activity kind is plain text.                               | This keeps organizer-dependent labels flexible and supports battle/workshop/general-entry-like examples without premature taxonomy.   | Keep flexible until organizer/product validation, or introduce controlled values later.   |
| Authentication and admin access are not implemented.       | The read endpoint is foundation work; protected admin access is important but should not be mixed into event/activity modeling.       | Track separately in issue #78, “Define minimal admin authentication and access boundary.” |

## Acceptance readback for issue #60

| Acceptance criterion                                                               | Current status                                                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event and activity model is documented or implemented.                             | Satisfied: implemented in persistence, documented here, exposed through the read-only backend API, and consumed by a first admin frontend route.       |
| The model supports the draft MVP activity examples.                                | Satisfied for foundation scope: neutral activities can represent battle/workshop/general-entry-like examples without final product workflow semantics. |
| Organizer-dependent fields are configurable or deferred behind explicit decisions. | Satisfied: activity labels remain flexible, price/capacity/registration requirements are explicit deferred fields, and auth/access is tracked in #78.  |

Issue #60 can close once this readback is accepted. Remaining work should continue through focused follow-up issues rather than expanding the event/activity foundation scope.
