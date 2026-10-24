# Attendee lists contract

`GET /admin/events/:eventId/attendee-lists` (#65) returns the contact-free data an administrator prints, or saves as PDF, before the event for the paper fallback (see the [event-day runbook](../runbooks/event-day.md)). It is a read: no CSRF token is needed and nothing is written. The check-in screen (#336) reads the same snapshot to list the event's registrations and their check-in state.

## Access

An administrator of this event or a global administrator gets `200`. Anonymous requests, judges and administrators of another event get the same safe `401` with no data. An unknown event returns `404`; a non-UUID `eventId` returns `400`.

## Response

One unpaginated snapshot:

- `event`: `{ id, name }`.
- `generatedAt`: server time of the read (ISO 8601). The lists are a point-in-time snapshot and may be stale by the time they are used.
- `passTypes[]`: `{ id, name, passClass, status }` for every pass type held by a listed registration, archived ones included (they record what was bought). Ordered `full` → `general` → `add_on`, then by name, then by id.
- `activities[]`: `{ id, name, kind, startsAt }` for every `competition` or `workshop` activity a listed registration can access through its passes (the check-in kinds). `social` activities are excluded. Ordered by start time, then name, then id.
- `registrations[]`, ordered by full name (case-insensitive), then id:
  - `registrationId`, `folio` (or `null` before confirmation), `fullName`, `stageName` (AKA, or `null`) and `status`.
  - `eventCheckedInAt`: the event check-in time, or `null`.
  - `passTypeIds`: the held pass types, in the `passTypes` order.
  - `activities[]`: `{ activityId, checkedInAt }` for each accessible activity, in the `activities` order, with that activity's check-in time or `null`.

Only `confirmed` and `pending_payment` registrations are listed, each with its status. `voided` registrations are excluded, so a printed row never suggests admitting one.

## Privacy

The response never contains contact fields: no email, phone, Instagram or birth date. The service selects columns one by one, so those fields never leave the database; it does not rely on the UI hiding them.

## Admin UI

"Listas de respaldo" (`/admin/events/:eventId/lists`) builds one list for the whole event, one per pass type and one per activity from a single response, and prints the event, the list name and the generation time at the top of every page. See [Frontend architecture](../frontend-architecture.md#route-areas).

Evidence: `apps/backend/src/events/attendee-lists/`, `apps/backend/test/admin-attendee-lists.e2e-spec.ts`, `apps/frontend/src/entities/attendee-list/`, `apps/frontend/src/pages/admin/ui/admin-lists-page.tsx`, `apps/frontend/e2e/admin-attendee-lists.spec.ts`.
