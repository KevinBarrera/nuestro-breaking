# Event sales contract

This contract describes each event's public address (slug) and its sales state for issue #175. The admin endpoints below are implemented and covered by backend e2e tests. The public catalog that reads this state is a later slice of #175.

## Current answer

- Every event has a **stable public slug**, for example `los-mas-pesados-nov-2026`. Migrations and the seed set it. The admin API cannot edit it, so shared links stay stable.
- Sales are controlled by an **admin switch** (closed by default) plus an **optional window**: an opening date, a closing date, both, or neither.
- The **sales state** is computed when it is read, from the switch, the window, and the current time. It is never stored.

## Data model

Migration: `apps/backend/drizzle/0014_event_sales_state.sql`. All columns live on `events`.

| Column            | Type                    | Rules enforced in SQL                                                                                                 |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `slug`            | `text`, not null        | Unique (`events_slug_uq`); lowercase kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 80 characters (`events_slug_ck`). |
| `sales_enabled`   | `boolean`, not null     | Defaults to `false`.                                                                                                  |
| `sales_opens_at`  | `timestamptz`, nullable | When both dates are set, opening is before closing (`events_sales_window_ck`).                                        |
| `sales_closes_at` | `timestamptz`, nullable | See above.                                                                                                            |

Slug defaults:

- Rows that existed before `0014` get `event-` followed by their id without dashes (for example `event-3f2a…`). This is deterministic.
- Rows inserted without a slug get the same shape from a random UUID.
- The November seed gives its event `los-mas-pesados-nov-2026`. On a re-run it also replaces a generated slug (`event-` plus 32 hex characters) with that value, unless another event already uses it. A slug that is not generated is never overwritten.

## State rules

Code: `salesState` in `apps/backend/src/events/sales/sales-state.ts`, exported from `src/events/sales/index.ts`. It is a pure function of the settings and `now`, so the public catalog and public registration (#174) reuse the same rule.

| Condition (checked in order)         | `state`  | `reason`       |
| ------------------------------------ | -------- | -------------- |
| Switch off (whatever the dates say)  | `closed` | `disabled`     |
| `now` is before `salesOpensAt`       | `closed` | `not_yet_open` |
| `now` is at or after `salesClosesAt` | `closed` | `ended`        |
| Otherwise                            | `open`   | `null`         |

The opening date is inclusive and the closing date is exclusive. A missing date does not limit that side of the window.

## Admin API

Both endpoints sit under `/admin/events/:eventId/sales` and use the [admin authentication boundary](admin-auth-boundary.md). Code: `apps/backend/src/events/sales/`.

Response shape for both:

```json
{
  "slug": "los-mas-pesados-nov-2026",
  "salesEnabled": true,
  "salesOpensAt": "2026-10-15T15:00:00.000Z",
  "salesClosesAt": null,
  "state": "open",
  "reason": null
}
```

Dates are ISO 8601 in UTC, or `null`.

| Method | Auth                                               | Body                                                                                           | Errors                                                                                             |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET`  | Admin session for the event (or global admin)      | None                                                                                           | 401 without an admin session for the event; 404 unknown event.                                     |
| `PUT`  | Admin session, trusted `Origin` and `X-CSRF-Token` | `{ "salesEnabled": boolean, "salesOpensAt": string \| null, "salesClosesAt": string \| null }` | 400 invalid body or window; 401 no admin session; 403 bad origin or CSRF token; 404 unknown event. |

`PUT` rules:

- It replaces all three settings, so all three keys are required. Any other key, including `slug`, is rejected with 400.
- Dates must be ISO 8601 date-times with an explicit offset (`Z` or `±hh:mm`). Plain dates and numbers are rejected.
- `salesOpensAt` must be before `salesClosesAt` when both are set. The database check is the backstop.

## Known gaps

| Gap                                                                                                                                                       | Follow-up                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Sales changes are **not audited**. `event_catalog_audit` only accepts `activity` and `pass_type` entities; auditing event settings needs a schema change. | Later hardening            |
| `PUT` has no optimistic concurrency (`expectedVersion`); the last write wins.                                                                             | Later hardening            |
| The slug cannot be changed through the API (by design, D3 in `odd/tasks/public-catalog-sales.md`).                                                        | Product decision if needed |
| No admin UI yet.                                                                                                                                          | T4 of #175                 |

## Cross-references

- [Event catalog contract](event-catalog.md)
- [Admin authentication boundary](admin-auth-boundary.md)
- [November 2026 online purchase plan](../product/november-2026-online-purchase-plan.md)
