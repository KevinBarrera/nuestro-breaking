# Public registration contract

This contract describes how a buyer without an account creates a `pending_payment` registration for one person (themselves) from the public purchase flow, for issue #174. The purchase screens (#176) call it, and online payment (#177) confirms the registration it returns. It is implemented and covered by backend unit and e2e tests.

## Current answer

- `POST /public/events/:slug/registrations` needs **no login, session, cookie or CSRF token**. It is rate limited and uses the public CORS rules of the [public event catalog](public-event-catalog.md#cors).
- Sales must be **open** at request time.
- One request creates (or reuses, see [Duplicates](#duplicates)) **one** `pending_payment` registration with its passes, price snapshots and competition selections, plus one audit fact, in **one database transaction**. Nothing is written when any check fails.
- The registration is not paid yet. It never becomes `confirmed` here; only a verified payment (#177) or an admin cash confirmation does.

## Endpoint

| Method | Path                                 | Auth | Success | Errors                                                                                    |
| ------ | ------------------------------------ | ---- | ------- | ----------------------------------------------------------------------------------------- |
| `POST` | `/public/events/:slug/registrations` | None | 201     | 400 invalid body, 404 unknown slug, 409 sales closed or rule violation, 429 rate limited. |

Code: `apps/backend/src/events/public-registration/`. The pure validator is `parsePublicRegistrationRequest` in `public-registration-request.ts`; the pure pass rules are `passRuleViolation` in `public-registration-rules.ts`.

## Request

```json
{
  "buyer": {
    "firstName": "Ana",
    "firstLastName": "López",
    "secondLastName": "García",
    "stageName": "B-Girl Ana",
    "email": "ana@example.com",
    "phone": "+52 55 1234 5678",
    "city": "Ciudad de México",
    "instagram": "@b.girl_ana",
    "level": "Intermedio",
    "birthDate": "2000-02-29"
  },
  "passes": [{ "passTypeId": "6f1c…", "selectedActivityIds": ["a93e…"] }, { "passTypeId": "7d20…" }]
}
```

Buyer fields follow #58. Unknown keys are rejected at every level.

| Field                 | Required | Rule                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `firstName`           | Yes      | Trimmed, at most 100 characters.                                                            |
| `firstLastName`       | Yes      | Trimmed, at most 100 characters.                                                            |
| `secondLastName`      | No       | Trimmed, at most 100 characters.                                                            |
| `stageName`           | No       | The AKA. Trimmed, at most 100 characters.                                                   |
| `email`               | Yes      | At most 254 characters, `name@domain.tld` shape. Stored trimmed and lowercased.             |
| `phone`               | Yes      | At most 30 characters, 10 to 15 digits once spaces and symbols are removed. Stored trimmed. |
| `city`                | No       | Trimmed, at most 100 characters.                                                            |
| `instagram`           | No       | At most 64 characters. Stored without leading `@`, lowercased; it cannot contain spaces.    |
| `level`               | No       | Free text, at most 50 characters.                                                           |
| `birthDate`           | No       | `YYYY-MM-DD`, a real calendar date, from `1900-01-01` up to today (UTC).                    |
| `passes`              | Yes      | 1 to 10 items. Each `passTypeId` is a UUID and appears once.                                |
| `selectedActivityIds` | No       | Per pass: at most 20 unique activity UUIDs. Omitted or `null` means no selection.           |

Optional text sent as `null` or blank is treated as absent. The full display name is built from the name parts (`Ana López García`).

## Response

`201` for a new registration and for a reused pending one (the response never says which):

```json
{
  "registrationId": "1b7e…",
  "status": "pending_payment",
  "passes": [
    {
      "passTypeId": "6f1c…",
      "name": "Pase completo Breaking",
      "passClass": "full",
      "priceCents": 200000,
      "selectedActivityIds": ["a93e…"]
    }
  ],
  "totalCents": 200000
}
```

Passes keep the request order. `priceCents` is the price snapshot stored on the registration; a later catalog price change does not affect it.

## Validation errors (400)

```json
{
  "statusCode": 400,
  "message": "Invalid registration",
  "fieldErrors": { "buyer.email": "invalid", "passes[0].passTypeId": "required" }
}
```

Every problem is reported at once, keyed by field path (`buyer.<field>`, `passes`, `passes[<i>].passTypeId`, `passes[<i>].selectedActivityIds[<j>]`, or `body` when the body is not an object). The UI maps the codes to Spanish messages:

| Code            | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `required`      | Missing, `null` or blank; `passes` is empty.                           |
| `invalid`       | Wrong type or format (email, phone digits, Instagram, date, UUID).     |
| `too_long`      | Text longer than the limit above.                                      |
| `too_many`      | More than 10 passes, or more than 20 selections on one pass.           |
| `duplicate`     | The same pass type or activity appears twice.                          |
| `in_future`     | `birthDate` is after today.                                            |
| `unknown_field` | A key that the contract does not define (for example `buyer.country`). |

The body is validated before the event is looked up, so a malformed body is a 400 even for an unknown slug.

## Sales and event (404, 409)

The endpoint reuses `PublicCatalogService.requireOpen`: an unknown or malformed slug is the neutral `404 { "message": "Event not found" }`, and closed sales are `409 { "statusCode": 409, "message": "Sales are closed", "reason": "disabled" | "not_yet_open" | "ended" }`.

## Catalog rules (409)

Checked inside the write transaction, with the requested pass types and activities share-locked so a concurrent archive or price edit cannot interleave. The first violation answers `409 { "statusCode": 409, "code": "<code>", "message": "<message>" }`:

| `code`                  | `message`                                    | When                                                                                  |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pass_type_unavailable` | `Pass type is not available`                 | The pass type is archived or does not belong to this event.                           |
| `general_with_full`     | `A full pass already includes general entry` | General entry and a full pass in one request (D1).                                    |
| `required_pass_missing` | `Add-on requires a full pass`                | An add-on (Open Styles) without a pass of its required class in the same request.     |
| `selection_unavailable` | `Invalid activity selection`                 | A selected activity is archived, not `selectable` for that pass, or in another event. |

These are the same rules as admin pass assignment and selection changes (`registration-entitlements`). There is no maximum number of selections per pass beyond the request limit of 20.

## Duplicates

Under the same per-event advisory lock as admin manual registration, the buyer is matched against the event's registrations that are not `voided`, by:

- **email**: trimmed and lowercased on both sides;
- **phone match key** (`phoneMatchKey`): digits only, and a Mexican number is reduced to its ten-digit national number, so `+52 55 1234 5678`, `5215512345678` (legacy mobile prefix) and `55 1234 5678` are the same buyer. Stored phones are compared with the same rule in SQL.

| Match found                    | Result                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any `confirmed` registration   | `409 { "statusCode": 409, "code": "registration_unavailable", "message": "This registration cannot be completed online. Please contact the organizer." }`. Nothing about the existing record is revealed. |
| A `pending_payment` one        | Reused: the row is locked `FOR UPDATE`, its participant profile is updated with the new buyer data, and its passes and selections are replaced by the request. Same `registrationId`, `201`.              |
| Only `voided` ones, or nothing | A new participant and registration are created.                                                                                                                                                           |

When several pending registrations match (one by email, another by phone), the email match is reused first, then the oldest. Admin manual registrations count as matches too. Activity links an admin stored on a reused registration (`event_activity_registrations`) are left unchanged.

Pending registrations that are never paid stay `pending_payment`; expiring or cleaning them up is #181.

## Audit

Each successful request appends one `online_registration` fact in the same transaction, with `actor_kind = 'public'` and null `actor_user_id` and `session_id` (see the [audit policy](admin-registration-audit-policy.md#actor-kinds-and-stored-operation-types-174)):

- `before_state`: `{ "registration": null }` for a new registration, or `{ "status": "pending_payment", "passes": [...] }` with the replaced passes for a reused one;
- `after_state`: status, participant id, and each pass with its registration pass id, pass type id, price snapshot and selections;
- `facts`: `{ "participantCreated": boolean, "registrationReused": boolean }`;
- `affected_activity_ids`: the selected activities.

No names, email, phone, Instagram, birth date or request body are stored in the audit.

## Legal acceptance (#180)

Legal acceptance (terms and privacy notice) is not stored yet (D6). #180 adds it to this request and stores it with the registration inside the same transaction; the hook point is marked in `public-registration.controller.ts`.

## Cross-references

- [Public event catalog](public-event-catalog.md)
- [Admin registration audit policy](admin-registration-audit-policy.md)
- [Admin registration operations](admin-registration-operations.md)
- Feature tasks: `odd/tasks/public-pending-registration.md`
