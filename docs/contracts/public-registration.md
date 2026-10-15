# Public registration contract

This contract describes how a buyer without an account creates a `pending_payment` registration for one person (themselves) from the public purchase flow, for issue #174. The purchase screens (#176) call it, and online payment (#177) confirms the registration it returns. It is implemented and covered by backend unit and e2e tests.

## Current answer

- `POST /public/events/:slug/registrations` needs **no login, session, cookie or CSRF token**. It is rate limited and uses the public CORS rules of the [public event catalog](public-event-catalog.md#cors).
- Sales must be **open** at request time.
- The buyer must accept the current version of the three [legal documents](#legal-acceptance-180).
- One request creates (or reuses, see [Duplicates](#duplicates)) **one** `pending_payment` registration with its passes, price snapshots, competition selections and legal acceptances, plus one audit fact, in **one database transaction**. Nothing is written when any check fails.
- The registration is not paid yet. It never becomes `confirmed` here; only a verified payment (#177) or an admin cash confirmation does.

## Endpoint

| Method | Path                                 | Auth | Success | Errors                                                                                                |
| ------ | ------------------------------------ | ---- | ------- | ----------------------------------------------------------------------------------------------------- |
| `POST` | `/public/events/:slug/registrations` | None | 201     | 400 invalid body, 404 unknown or archived slug, 409 sales closed or rule violation, 429 rate limited. |

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
  "passes": [
    { "passTypeId": "6f1c…", "selectedActivityIds": ["a93e…"] },
    { "passTypeId": "7d20…" }
  ],
  "legalAcceptances": {
    "rules": "borrador-2026-10-13",
    "privacy": "borrador-2026-10-13",
    "cancellation": "borrador-2026-10-13"
  }
}
```

Buyer fields follow #58. Unknown keys are rejected at every level.

| Field                 | Required | Rule                                                                                               |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `firstName`           | Yes      | Trimmed, at most 100 characters.                                                                   |
| `firstLastName`       | Yes      | Trimmed, at most 100 characters.                                                                   |
| `secondLastName`      | No       | Trimmed, at most 100 characters.                                                                   |
| `stageName`           | No       | The AKA. Trimmed, at most 100 characters.                                                          |
| `email`               | Yes      | At most 254 characters, `name@domain.tld` shape. Stored trimmed and lowercased.                    |
| `phone`               | Yes      | At most 30 characters, 10 to 15 digits once spaces and symbols are removed. Stored trimmed.        |
| `city`                | No       | Trimmed, at most 100 characters.                                                                   |
| `instagram`           | No       | At most 64 characters. Stored without leading `@`, lowercased; it cannot contain spaces.           |
| `level`               | No       | Free text, at most 50 characters.                                                                  |
| `birthDate`           | No       | `YYYY-MM-DD`, a real calendar date, from `1900-01-01` up to today (UTC).                           |
| `passes`              | Yes      | 1 to 10 items. Each `passTypeId` is a UUID and appears once.                                       |
| `selectedActivityIds` | No       | Per pass: at most 20 unique activity UUIDs. Omitted or `null` means no selection.                  |
| `legalAcceptances`    | Yes      | The accepted version of `rules`, `privacy` and `cancellation`; see [below](#legal-acceptance-180). |

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

Every problem is reported at once, keyed by field path (`buyer.<field>`, `passes`, `passes[<i>].passTypeId`, `passes[<i>].selectedActivityIds[<j>]`, `legalAcceptances`, `legalAcceptances.<document>`, or `body` when the body is not an object). The UI maps the codes to Spanish messages:

| Code            | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `required`      | Missing, `null` or blank; `passes` is empty; a document not accepted.  |
| `invalid`       | Wrong type or format (email, phone digits, Instagram, date, UUID).     |
| `too_long`      | Text longer than the limit above.                                      |
| `too_many`      | More than 10 passes, or more than 20 selections on one pass.           |
| `duplicate`     | The same pass type or activity appears twice.                          |
| `in_future`     | `birthDate` is after today.                                            |
| `outdated`      | A legal document was accepted at a version that is no longer current.  |
| `unknown_field` | A key that the contract does not define (for example `buyer.country`). |

The body is validated before the event is looked up, so a malformed body is a 400 even for an unknown slug.

## Sales and event (404, 409)

The endpoint reuses `PublicCatalogService.requireOpen`: an unknown, malformed or [archived](admin-event-lifecycle.md#archiving-and-restoring) slug is the neutral `404 { "message": "Event not found" }`, and closed sales are `409 { "statusCode": 409, "message": "Sales are closed", "reason": "disabled" | "not_yet_open" | "ended" }`.

## Catalog rules (409)

Checked inside the write transaction, with the requested pass types and activities share-locked so a concurrent archive or price edit cannot interleave. The first violation answers `409 { "statusCode": 409, "code": "<code>", "message": "<message>" }`:

| `code`                   | `message`                                    | When                                                                                                                                                                           |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pass_type_unavailable`  | `Pass type is not available`                 | The pass type is archived or does not belong to this event.                                                                                                                    |
| `pass_type_sales_closed` | `Online sales of this pass are closed`       | The pass's own online close time (#240) has been reached, checked when the request is processed, so a page loaded earlier does not help. Admin manual registration ignores it. |
| `general_with_full`      | `A full pass already includes general entry` | General entry and a full pass in one request (D1).                                                                                                                             |
| `required_pass_missing`  | `Add-on requires a full pass`                | An add-on (Open Styles) without a pass of its required class in the same request.                                                                                              |
| `selection_unavailable`  | `Invalid activity selection`                 | A selected activity is archived, not `selectable` for that pass, or in another event.                                                                                          |

These are the same rules as admin pass assignment and selection changes (`registration-entitlements`). There is no maximum number of selections per pass beyond the request limit of 20.

## Duplicates

Under the same per-event advisory lock as admin manual registration, the buyer is matched against the event's registrations that are not `voided`, by:

- **email**: trimmed and lowercased on both sides;
- **phone match key** (`phoneMatchKey`): digits only, and a Mexican number is reduced to its ten-digit national number, so `+52 55 1234 5678`, `5215512345678` (legacy mobile prefix) and `55 1234 5678` are the same buyer. Stored phones are compared with the same rule in SQL.

| Match found                    | Result                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any `confirmed` registration   | `409 { "statusCode": 409, "code": "registration_unavailable", "message": "This registration cannot be completed online. Please contact the organizer." }`. Nothing about the existing record is revealed. |
| A `pending_payment` one        | Reused: the row is locked `FOR UPDATE`, its participant profile is updated with the new buyer data, and its passes and selections are replaced by the request. Same `registrationId`, `201`.              |
| Only `voided` ones, or nothing | A new participant and registration are created. Expired online pending registrations of the event are voided first, so they count as `voided` here.                                                       |

When several pending registrations match (one by email, another by phone), the email match is reused first, then the oldest. Admin manual registrations count as matches too. Activity links an admin stored on a reused registration (`event_activity_registrations`) are left unchanged.

## Payment window (#181)

An online pending registration expires if it is never paid. Its `expires_at` is set to `PENDING_PAYMENT_HOURS` (default 72) plus one day after it is created or reused. Each checkout (`POST .../checkout`) opens a new payment window: the Mercado Pago preference carries `date_of_expiration` = now + `PENDING_PAYMENT_HOURS` (sent with a `+00:00` offset), and `expires_at` moves to one day after it. Mercado Pago refunds a payment made after `date_of_expiration`, so the extra day leaves time for a voucher paid at the last minute to be credited and notified. Admin manual registrations have no `expires_at` and never expire on their own, even when an online buyer reuses one or starts a checkout for it. Online pending registrations created before migration 0023 got `updated_at` + 96 hours.

Once `expires_at` passes, the registration is voided with a `registration_expiry` audit fact (system actor, see the [audit policy](admin-registration-audit-policy.md)). This happens at the first of: a purchase for the same event (inside the per-event lock, before duplicates are checked), a checkout for that registration (which then answers `409 registration_not_payable`), or the periodic sweep every `PENDING_EXPIRY_SWEEP_INTERVAL_MS` (default 300000, `0` turns it off; e2e keeps it off). The sweep takes the same per-event lock and skips rows a payment notification is holding. A registration confirmed before it is voided stays confirmed. A Mercado Pago approval that arrives after expiry follows the late approval rule: it confirms the registration when the event has not ended and the same person holds no other pending or confirmed registration in the event, and otherwise it is recorded for coordination's manual review. Once an online registration with a checkout has expired (in the last 30 days), the backend searches its Mercado Pago payments once (`GET /v1/payments/search?external_reference=<registration id>`, on the expiry sweep's interval) and applies each one like a notification, so an approval whose notifications never arrived follows the same rules; `payments_reconciled_at` records the search, and a failed search is retried on a later sweep (see the [audit policy](admin-registration-audit-policy.md) and the [support runbook](../runbooks/support.md)). If the registration is voided while the checkout is waiting for Mercado Pago, the checkout answers `409 registration_not_payable` and records nothing; the unused preference is left at Mercado Pago.

## Audit

Each successful request appends one `online_registration` fact in the same transaction, with `actor_kind = 'public'` and null `actor_user_id` and `session_id` (see the [audit policy](admin-registration-audit-policy.md#actor-kinds-and-stored-operation-types-174)):

- `before_state`: `{ "registration": null }` for a new registration, or `{ "status": "pending_payment", "passes": [...] }` with the replaced passes for a reused one;
- `after_state`: status, participant id, and each pass with its registration pass id, pass type id, price snapshot and selections;
- `facts`: `{ "participantCreated": boolean, "registrationReused": boolean }`;
- `affected_activity_ids`: the selected activities.

No names, email, phone, Instagram, birth date or request body are stored in the audit.

## Legal acceptance (#180)

Before paying, the buyer accepts three documents, published as pages of the purchase flow that show their version: `rules` (Reglamento oficial), `privacy` (Aviso de privacidad) and `cancellation` (Política de cancelación; the MVP has no refunds). The current versions live in `apps/backend/src/events/legal-documents/legal-documents.ts` and, with the texts, in `apps/frontend/src/shared/config/legal-documents.ts`; a new text changes the version in both. Until the organizer delivers the final texts (before launch, #182), every version is the placeholder `borrador-2026-10-13`.

- `legalAcceptances` must name the **current** version of all three documents. A missing one is `required`; any other version is `outdated` (the buyer read an older text and must reload). Nothing is written in either case.
- Each successful request appends one row per document to `registration_legal_acceptances` (migration 0026) in the same transaction: `registration_id`, `document_key`, `document_version` and `accepted_at`.
- The table is append-only. A reused pending registration gets three new rows and keeps the earlier ones, so changing a version never alters past acceptances.
- The audit fact does not repeat the acceptances.

## Cross-references

- [Public event catalog](public-event-catalog.md)
- [Public payment status](public-payment-status.md)
- [Admin event lifecycle](admin-event-lifecycle.md)
- [Admin registration audit policy](admin-registration-audit-policy.md)
- [Admin registration operations](admin-registration-operations.md)
- Feature tasks: `odd/tasks/public-pending-registration.md`

## Known risks

- Reuse is keyed only on contact details. Anyone who submits another buyer's email or phone replaces that buyer's **unpaid** registration: its profile, passes and selections, including a pending registration an admin created. Confirmed registrations are never touched, nothing personal is returned, and the audit records the replaced passes. Proving control of the email before reuse is a candidate follow-up with the abandoned-registration work (#181).
