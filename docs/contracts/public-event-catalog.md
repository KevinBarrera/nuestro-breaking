# Public event catalog contract

This contract describes the public, read-only catalog of one event for issue #175. The public purchase screens (#176) read it, and [public registration](public-registration.md) (#174) reuses its sales check. It is implemented and covered by backend unit and e2e tests.

## Current answer

- `GET /public/events/:slug/catalog` needs **no login, session, cookie or CSRF token**.
- It always returns the event summary and the **sales state**. Passes are listed **only while sales are open** (D4 in `odd/tasks/public-catalog-sales.md`).
- Only **active** pass types and **active** activities appear. Archived rows never do.
- The response is an explicit allowlist (D5): no `version`, `status`, organization or event ids, audit fields or personal data.
- It is **rate limited** per client IP (default 60 requests per minute) and answers **429** over the limit.
- Browsers may call it only from **configured origins**, and never with credentials.

## Endpoint

| Method | Path                           | Auth | Success | Errors                                                                                                      |
| ------ | ------------------------------ | ---- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `GET`  | `/public/events/:slug/catalog` | None | 200     | 404 `{ "message": "Event not found" }` for an unknown, malformed or archived slug. 429 over the rate limit. |

A slug that does not match the stored slug rule (lowercase kebab-case, at most 80 characters; see the [event sales contract](event-sales.md)) is answered with the same 404 as an unknown one, so the response never says why a slug failed. An [archived event](admin-event-lifecycle.md#archiving-and-restoring) gets that same 404.

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
- throws the same neutral 404 as the catalog for an unknown, malformed or archived slug.

`requireEvent` (used by [payment status](public-payment-status.md)) still finds an archived event, so buyers can follow up on a payment.

Callers pass `now` explicitly, so tests stay deterministic. [Public registration](public-registration.md) calls it inside the request that writes, not relying on an earlier catalog read.

## CORS

CORS is chosen per request path (`apps/backend/src/http/cors-options.ts`, wired by `configureHttp` in `main.ts`):

| Paths                   | Allowed origins                                                    | Credentials | Exposed headers |
| ----------------------- | ------------------------------------------------------------------ | ----------- | --------------- |
| `/public` and below     | `AUTH_TRUSTED_ORIGIN` plus each origin in `PUBLIC_ALLOWED_ORIGINS` | Never       | None            |
| Everything else (admin) | `AUTH_TRUSTED_ORIGIN` only, unchanged                              | Yes         | `X-CSRF-Token`  |

- `PUBLIC_ALLOWED_ORIGINS` is a comma-separated list of exact origins (`https://tickets.example,https://www.example`). Entries are trimmed and matched exactly; wildcards, paths and trailing slashes stop the API at startup.
- A public response reflects the request `Origin` only when it is listed, and always sends `Vary: Origin`. An unknown origin gets no `Access-Control-Allow-*` headers, so the browser blocks the read.
- Public routes never send `Access-Control-Allow-Credentials`, so a public page cannot use an admin session cookie.

## Rate limit

Public controllers use `@PublicRateLimit()` (`apps/backend/src/http/public-rate-limit.ts`, built on `@nestjs/throttler`). Admin and auth routes are not limited.

| Variable                   | Default | Meaning                                      |
| -------------------------- | ------- | -------------------------------------------- |
| `PUBLIC_RATE_LIMIT_LIMIT`  | `60`    | Requests per client IP and route per window. |
| `PUBLIC_RATE_LIMIT_TTL_MS` | `60000` | Window length in milliseconds.               |

- Values must be positive integers; anything else stops the API at startup. Blank values use the defaults.
- Over the limit the API answers `429` with `{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }` and a `Retry-After` header in seconds. Responses also carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.
- Counters live in process memory: they reset on restart and are not shared between API instances.

### Client address behind reverse proxies

The limit keys on Express `req.ip`. Behind reverse proxies, `req.ip` is the last proxy's address unless Express `trust proxy` is set, so every buyer would share one counter. `TRUST_PROXY_HOPS` sets it to a hop count:

| Variable           | Default | Meaning                                                                     |
| ------------------ | ------- | --------------------------------------------------------------------------- |
| `TRUST_PROXY_HOPS` | `0`     | Reverse proxies in front of the API, `0` to `5`. `0` sets no `trust proxy`. |

- Each proxy appends the address it received the request from to `X-Forwarded-For`. With `N` hops, `req.ip` is the `N`th entry from the right: the client the outermost proxy saw. Entries a client prepends stay to the left and are ignored.
- Deployment values: `1` behind Railway's edge proxy alone, `2` with the Cloudflare proxy in front of Railway.
- The value must match the real proxy chain. Too low and buyers share a proxy's counter; too high and a client can choose its own address by sending `X-Forwarded-For`.
- Any other value stops the API at startup. Blank uses the default.

## Known gaps

| Gap                                                               | Follow-up |
| ----------------------------------------------------------------- | --------- |
| Rate-limit counters are per process, not shared across instances. | Later     |
| No HTTP caching headers.                                          | Later     |

## Cross-references

- [Public registration contract](public-registration.md)
- [Event sales contract](event-sales.md)
- [Event catalog contract](event-catalog.md)
- [Admin event lifecycle contract](admin-event-lifecycle.md)
- [November 2026 online purchase plan](../product/november-2026-online-purchase-plan.md)
