# Public event catalog contract

This contract describes the public, read-only catalog of one event for issue #175. The public purchase screens (#176) read it, and public registration (#174) reuses its sales check. It is implemented and covered by backend unit and e2e tests.

## Current answer

- `GET /public/events/:slug/catalog` needs **no login, session, cookie or CSRF token**.
- It always returns the event summary and the **sales state**. Passes are listed **only while sales are open** (D4 in `odd/tasks/public-catalog-sales.md`).
- Only **active** pass types and **active** activities appear. Archived rows never do.
- The response is an explicit allowlist (D5): no `version`, `status`, organization or event ids, audit fields or personal data.

## Endpoint

| Method | Path                           | Auth | Success | Errors                                                                   |
| ------ | ------------------------------ | ---- | ------- | ------------------------------------------------------------------------ |
| `GET`  | `/public/events/:slug/catalog` | None | 200     | 404 `{ "message": "Event not found" }` for an unknown or malformed slug. |

A slug that does not match the stored slug rule (lowercase kebab-case, at most 80 characters; see the [event sales contract](event-sales.md)) is answered with the same 404 as an unknown one, so the response never says why a slug failed.

Code: `apps/backend/src/events/public-catalog/`. The pure projection is `toPublicCatalog` in `public-catalog.projection.ts`.

## Response

```json
{
  "event": {
    "slug": "los-mas-pesados-nov-2026",
    "name": "Los más pesados",
    "timeZone": "America/Bogota",
    "startsAt": "2026-11-20T14:00:00.000Z",
    "endsAt": "2026-11-22T04:00:00.000Z"
  },
  "sales": {
    "state": "open",
    "reason": null,
    "opensAt": "2026-10-15T15:00:00.000Z",
    "closesAt": null
  },
  "passes": [
    {
      "id": "6f1c…",
      "name": "Open Styles",
      "passClass": "add_on",
      "priceCents": 80000,
      "requiresPassClass": "full",
      "selectableActivities": [],
      "includedActivities": [
        {
          "id": "a93e…",
          "name": "Open Styles 1vs1",
          "kind": "competition",
          "startsAt": "2026-11-21T18:00:00.000Z",
          "endsAt": "2026-11-21T20:00:00.000Z"
        }
      ]
    }
  ]
}
```

- Dates are ISO 8601 in UTC, or `null`. `event.timeZone` is the IANA zone to display them in.
- `sales.state` and `sales.reason` follow the [sales state rules](event-sales.md#state-rules), computed at request time: `reason` is `disabled`, `not_yet_open` or `ended` when closed, and `null` when open.
- `passClass` is `full`, `general` or `add_on`. `requiresPassClass` names the class an add-on needs (Open Styles requires `full`), or is `null`.
- `selectableActivities` are the activities a buyer picks from; `includedActivities` come with the pass. Pass and activity ids are exposed because public registration (#174) submits them.

## Ordering

- Passes: by class (`full`, then `general`, then `add_on`), then name, then id.
- Activities inside a pass: by start time, then name, then id.

## Closed sales

When `sales.state` is `closed`, the response still has `event` and `sales` (so the screen can say when sales open or that they ended), and `passes` is `[]`. The pass and activity tables are not read.

## Reusable sales check (#174)

`PublicCatalogService.requireOpen(slug, now)`, exported from `src/events/public-catalog/index.ts`, resolves the event by slug and:

- returns `{ eventId, slug }` when sales are open at `now`;
- throws `SalesClosedException` (409, body `{ "statusCode": 409, "message": "Sales are closed", "reason": "<reason>" }`) when they are closed;
- throws the same neutral 404 as the catalog for an unknown or malformed slug.

Callers pass `now` explicitly, so tests stay deterministic. Public registration should call it inside the request that writes, not rely on an earlier catalog read.

## Known gaps

| Gap                                                                                      | Follow-up  |
| ---------------------------------------------------------------------------------------- | ---------- |
| Not rate limited yet.                                                                    | T3 of #175 |
| CORS still allows only the admin origin; browsers on a public origin cannot call it yet. | T3 of #175 |
| No HTTP caching headers.                                                                 | Later      |

## Cross-references

- [Event sales contract](event-sales.md)
- [Event catalog contract](event-catalog.md)
- [November 2026 online purchase plan](../product/november-2026-online-purchase-plan.md)
