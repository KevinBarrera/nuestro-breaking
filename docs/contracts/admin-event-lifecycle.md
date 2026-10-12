# Admin event lifecycle contract

This contract describes how administrators create, edit, archive, restore and delete events through the admin API ([#213](https://github.com/KevinBarrera/nuestro-breaking/issues/213)). The backend endpoints below are implemented and covered by backend e2e tests. The admin panel screens for them arrive later in #213 (event list with "Crear evento", "Nuevo evento", "Datos del evento", archive and delete dialogs).

## Current answer

- A **global admin** creates an event with a name, slug, folio prefix, time zone and optional dates. Sales start **off**. The slug and folio prefix can never change afterwards.
- A global admin, or an admin scoped to the event, **edits** the name, time zone and dates.
- A global admin **archives** an event to retire it: sales turn off and the public site treats it as unknown, but all its data stays readable and payment follow-up keeps working. **Restoring** brings it back with sales still off.
- A global admin **deletes** an event only when it is **empty** (nothing scheduled, sold or audited), after typing its slug. The slug is then free again.
- Every action is recorded in `event_admin_audit` with who did it.

## Endpoints

All routes sit under `/admin/events` and use the [admin authentication boundary](admin-auth-boundary.md). Writes need a trusted `Origin` and the `X-CSRF-Token` header. Code: `apps/backend/src/events/admin-events/` (list: `src/events/check-in-event-list/`).

| Method and path                         | Who                                 | Body                                                        | Success                            |
| --------------------------------------- | ----------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `GET /admin/events`                     | Any admin (global or event-scoped)  | None. `?archived=true` also returns archived events.        | `200` list of event summaries      |
| `GET /admin/events/:eventId/foundation` | Admin or judge for the event        | None                                                        | `200` event, venues and activities |
| `POST /admin/events`                    | Global admin                        | `{ name, slug, folioPrefix, timeZone, startsAt?, endsAt? }` | `201` event                        |
| `PATCH /admin/events/:eventId`          | Global admin or admin for the event | Any of `{ name, timeZone, startsAt, endsAt }`               | `200` event                        |
| `POST /admin/events/:eventId/archive`   | Global admin                        | None                                                        | `201` event                        |
| `POST /admin/events/:eventId/restore`   | Global admin                        | None                                                        | `201` event                        |
| `DELETE /admin/events/:eventId`         | Global admin                        | `{ confirmSlug }`                                           | `204`, no body                     |

A caller without the required role gets `401` and an audited `denied` row in `auth_audit`, the same as other admin routes. A missing or foreign `Origin`, or a missing CSRF token, is `403`. A path id that is not a UUID is `400`.

### Response shapes

The list returns summaries ordered by name, limited to the events the caller may manage. Archived events are left out unless `?archived=true` (any other value is ignored):

```json
{
  "id": "…",
  "name": "Los más pesados",
  "slug": "los-mas-pesados-2026",
  "folioPrefix": "LMP",
  "archivedAt": null
}
```

`POST`, `PATCH`, archive and restore return the full event:

```json
{
  "id": "…",
  "name": "Los más pesados",
  "slug": "los-mas-pesados-2026",
  "folioPrefix": "LMP",
  "timeZone": "America/Mexico_City",
  "startsAt": "2026-11-21T16:00:00.000Z",
  "endsAt": "2026-11-23T04:00:00.000Z",
  "salesEnabled": false,
  "archivedAt": null
}
```

Dates are ISO 8601 in UTC, or `null`. The foundation `event` object carries the same fields plus `windowStatus`.

## Input rules

Code: `admin-event-input.ts` (pure parsing, unit tested).

| Field                | Rule                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`               | Trimmed, not blank, at most 120 characters, no control characters.                                                                                                                                                                         |
| `slug`               | Lowercase kebab-case, at most 80 characters (the rule in the [event sales contract](event-sales.md)). Unique across all events.                                                                                                            |
| `folioPrefix`        | 2 to 6 characters: an uppercase letter, then uppercase letters or digits (`FOLIO_PREFIX_PATTERN`).                                                                                                                                         |
| `timeZone`           | An IANA zone name accepted by `Intl`, for example `America/Mexico_City`, stored in its canonical spelling. Offsets such as `+01:00` are refused.                                                                                           |
| `startsAt`, `endsAt` | ISO 8601 with an explicit offset, or `null`. Both or neither; `endsAt` after `startsAt`. On `PATCH` they are checked merged with the stored dates, and the database still refuses a window that no longer contains the event's activities. |

`PATCH` refuses `slug` and `folioPrefix` with the field error `immutable`, any other unknown key with `invalid`, and an empty body with `{ "body": "invalid" }`. A `PATCH` that changes nothing answers `200` with the current event and writes no audit row.

## Errors

| Status | Body                                                                                     | When                                                                        |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `400`  | `{ "message": "Invalid event", "fieldErrors": { "<field>": "invalid" \| "immutable" } }` | Invalid input, or a `confirmSlug` that is missing or differs from the slug. |
| `404`  | `{ "message": "Event not found", "error": "Not Found" }`                                 | Unknown event id.                                                           |
| `409`  | `{ "code": "slug_taken", "fieldErrors": { "slug": "taken" } }`                           | `POST` with a slug another event uses.                                      |
| `409`  | `{ "code": "organization_ambiguous" }`                                                   | `POST` while more than one organization exists.                             |
| `409`  | `{ "code": "event_archived", "message": "Event is archived" }`                           | `PATCH` or archive on an archived event; turning sales on for it.           |
| `409`  | `{ "code": "event_not_archived", "message": "Event is not archived" }`                   | Restore on an event that is not archived.                                   |
| `409`  | `{ "code": "event_not_empty", "message": "Event is not empty", "blockers": ["…"] }`      | Delete on an event that is not empty (see below).                           |

All bodies also carry `statusCode`.

## Creating

- The event joins the **single organization**. In an empty database the backend creates it with the first event, under an advisory lock so two first creations cannot make two organizations. With more than one organization, creation is refused (`organization_ambiguous`) until a later issue adds a choice.
- Sales start disabled with no sales window. Open them with the [event sales API](event-sales.md) once the catalog is ready.

## Archiving and restoring

- Archiving sets `archived_at`, turns `sales_enabled` off and **keeps** the sales window, so restoring and reopening sales starts from the same dates.
- An archived event answers like an unknown slug in the [public catalog](public-event-catalog.md), [public registration](public-registration.md) and checkout (`404 Event not found`).
- [Payment status](public-payment-status.md) still answers, so buyers can follow up on a payment. A late Mercado Pago confirmation is still recorded and gets a folio; the webhook does not read the archive state.
- While archived, the event cannot be edited and sales cannot be turned on. Saving sales settings with sales off still works.
- Archived events drop out of the admin event selector and the check-in list; `GET /admin/events?archived=true` still lists them.
- Restoring clears `archived_at` and leaves sales off.

## Deleting an empty event

An event is **empty** when it has none of the rows below. Each kind present is listed in `blockers`:

| `blockers` value    | Rows that block                                                           |
| ------------------- | ------------------------------------------------------------------------- |
| `activities`        | `activities` (active or archived)                                         |
| `passTypes`         | `event_pass_types` (active or archived)                                   |
| `registrations`     | `event_registrations` (any status), which also covers payments and emails |
| `checkIns`          | `event_check_ins` (activity check-ins hang off these)                     |
| `catalogAudit`      | `event_catalog_audit`                                                     |
| `registrationAudit` | `registration_operation_audit`                                            |

When the event is empty, one transaction (with the event row locked, so nothing new can attach to it meanwhile):

1. removes the event's `event_venues` links, and the venues no other event uses;
2. removes the event-scoped roles (`user_roles` with `scope_type = 'event'` and this `scope_id`), so those admins lose access to it;
3. deletes the event and writes the `deleted` audit row.

Archived events can be deleted too, if they are empty. Anything else stays **archive only**: payment and folio history must survive.

## Audit

Table `event_admin_audit` (migration `0021`), append-only (a trigger refuses `UPDATE` and `DELETE`). Each row keeps `event_id` (no foreign key), the event's `event_slug` and `event_name` at that moment, the actor user and session, and JSON `details`. Rows survive a delete.

| Action     | `details`                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `created`  | The created fields: name, slug, folio prefix, time zone, dates, `salesEnabled: false`.               |
| `updated`  | `{ before, after }` with only the changed fields.                                                    |
| `archived` | `{ salesEnabled }`: the switch before archiving.                                                     |
| `restored` | `{ archivedAt }`: when it had been archived.                                                         |
| `deleted`  | `{ folioPrefix, archivedAt, venues, eventRoles }`: deleted venue ids and removed `{ userId, role }`. |

## Known gaps

| Gap                                                                                                                                                              | Follow-up        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| There is no admin API to create venues or attach them to an event. Activities need a venue of their event, so a new event cannot get activities yet without SQL. | Needs a decision |
| The admin panel screens for create, edit, archive, restore and delete are still being built in #213.                                                             | #213 slice 3     |
| Sales changes are still not audited (see the [event sales contract](event-sales.md#known-gaps)).                                                                 | Later hardening  |
| Deleting an event removes its event-scoped roles. A member whose only access was that event drops out of the team list, and their email cannot be invited again. | Needs a decision |
| An event-scoped role added at the same moment as a delete (the team API does not lock the event) could outlive the event; it grants nothing.                     | Later hardening  |

## Cross-references

- [Event sales contract](event-sales.md)
- [Event catalog contract](event-catalog.md)
- [Public event catalog contract](public-event-catalog.md)
- [Admin authentication boundary](admin-auth-boundary.md)
- [Setting up an event](../runbooks/admin-bootstrap.md#setting-up-an-event)
