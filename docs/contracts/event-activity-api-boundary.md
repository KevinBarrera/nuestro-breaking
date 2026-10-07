# Event/activity API boundary

This document defines the implemented read-only API boundary for the event/activity foundation. It does not approve the November 2026 MVP proposal.

> **Update (#124):** the foundation view below stays read-only, but it is no longer the only event/activity API. Admin write endpoints for activities, pass types (with price) and registration entitlements are delivered and documented in the [event catalog contract](event-catalog.md).

## Current answer

The safe API boundary is a read-only foundation view for administration:

```text
GET /admin/events/:eventId/foundation
```

It should return one event, the venues attached to that event, neutral activities inside the event, and explicit planning gaps. It must not expose registration, payment, check-in, authorization internals, scoring, or pilot-readiness claims.

## Why this boundary

| Need                                                       | Boundary decision                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Let frontend/admin consume real event/activity data later. | Provide a single foundation read model before adding workflows.                    |
| Preserve organizer-dependent decisions.                    | Include configurable/deferred fields instead of hard-coding final policy.          |
| Avoid leaking future workflows into #60.                   | Keep registration, payment, check-in, and competition behavior out of the payload. |
| Keep persistence and UI aligned.                           | Match fields already documented in the event/activity foundation contract.         |

## Implemented request

```http
GET /admin/events/:eventId/foundation
```

| Part       | Requirement                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `eventId`  | Stable event identifier.                                                                                                         |
| Caller     | Future authenticated admin-capable caller. Authentication mechanics are defined separately in the admin authentication boundary. |
| Scope      | One event foundation view. Cross-event search/list behavior is out of scope.                                                     |
| Mutability | Read-only. No state changes, commands, idempotency keys, or version preconditions.                                               |

The current backend route is implemented in `apps/backend/src/events/foundation/` and remains read-only. Activity and pass type writes use the separate catalog endpoints in the [event catalog contract](event-catalog.md); the foundation view still lists archived activities and does not expose `status`.

## Implemented response shape

```json
{
  "event": {
    "id": "evt_123",
    "name": "Fin de semana de breaking",
    "timeZone": "America/Bogota",
    "startsAt": "2026-11-14T09:00:00-05:00",
    "endsAt": "2026-11-15T20:00:00-05:00",
    "windowStatus": "bounded"
  },
  "venues": [
    {
      "id": "ven_123",
      "name": "Pista principal"
    }
  ],
  "activities": [
    {
      "id": "act_123",
      "name": "Batalla individual",
      "kind": "battle",
      "venueId": "ven_123",
      "startsAt": "2026-11-14T10:00:00-05:00",
      "endsAt": "2026-11-14T12:00:00-05:00",
      "planningStatus": "draft"
    }
  ],
  "deferredFields": ["priceDisplay", "capacity", "registrationRequirements"]
}
```

## Field rules

| Field                                          | Source or status                             | Rule                                                                          |
| ---------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `event.id`                                     | `events.id`                                  | Server-owned identifier.                                                      |
| `event.name`                                   | `events.name`                                | Nonblank display name.                                                        |
| `event.timeZone`                               | `events.time_zone`                           | PostgreSQL-catalog IANA zone used for authoring/display.                      |
| `event.startsAt`, `event.endsAt`               | `events.starts_at`, `events.ends_at`         | Both absent for unbounded events, or both present and ordered.                |
| `event.windowStatus`                           | Derived                                      | `unbounded` when both event endpoints are absent; `bounded` when both exist.  |
| `venues[].id`, `venues[].name`                 | `venues` joined through `event_venues`       | Only venues attached to the requested event.                                  |
| `activities[].id`                              | `activities.id`                              | Server-owned identifier.                                                      |
| `activities[].kind`                            | `activities.kind`                            | Flexible plain-text label until product validation decides controlled values. |
| `activities[].venueId`                         | `activities.venue_id`                        | Must reference a venue attached to the same event.                            |
| `activities[].startsAt`, `activities[].endsAt` | `activities.starts_at`, `activities.ends_at` | Ordered instants; overlapping activities are allowed.                         |
| `activities[].planningStatus`                  | API derivation                               | Use `draft` until publication/workflow semantics exist.                       |
| `deferredFields[]`                             | API metadata                                 | Names fields intentionally not guaranteed by the current foundation.          |

## Explicit exclusions

The response must not include or imply:

- attendee, participant, roster, folio, or lookup data;
- payment, cash, Mercado Pago, refund, or reconciliation state;
- check-in, attendance, or event-day exception handling;
- authorization rules, audit logs, or operator identity;
- brackets, scores, judges, winners, or competition category logic;
- legal/payment readiness or November pilot approval.

## Error boundary

The implemented boundary distinguishes these cases without leaking unrelated event data:

| Situation                                                | Planned behavior                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Event does not exist or caller cannot access it.         | Return a safe not-found/denied response using the admin authentication boundary.       |
| Event exists but has no venues or activities.            | Return the event with empty `venues` and/or `activities` arrays.                       |
| Stored data violates the documented foundation contract. | Treat as server-side data integrity failure; do not invent fields in the API response. |

## Relationship to issue #60

This boundary closes the read API gap from the foundation contract: the model now has a documented and implemented endpoint, with a first frontend route consuming it. Event-window containment is also implemented in migration `0003_event_window_containment`. Remaining product decisions, such as price/capacity persistence and controlled activity kinds, stay deferred to focused follow-up work rather than blocking issue #60. Since #124, price lives on pass types, not activities ([event catalog contract](event-catalog.md)); capacity and controlled activity kinds remain deferred.

## Cross-references

- [Event/activity foundation contract](event-activity-foundation.md)
- [Event catalog contract](event-catalog.md)
- [API and event versioning contract](api-event-versioning.md)
- [Admin authentication boundary](admin-auth-boundary.md)
- [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) — draft pending organizer validation
