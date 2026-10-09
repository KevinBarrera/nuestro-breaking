# Public payment status contract

This contract describes how the return page learns the result of an online payment, for issue #178. Mercado Pago sends the buyer back to `/e/:slug/pago?registration=<registrationId>`; the page polls this endpoint. The redirect never confirms anything: only the verified payment webhook (#177) does. It is implemented and covered by backend unit and e2e tests.

## Current answer

- `GET /public/events/:slug/registrations/:registrationId/payment-status` needs **no login, session, cookie or CSRF token**. It is rate limited and uses the public CORS rules of the [public event catalog](public-event-catalog.md#cors).
- It keeps answering **after sales close**: a buyer may come back from Mercado Pago, or pay an OXXO voucher, late.
- The registration UUID is the only reference (D2). It is random, not guessable, and no new token is stored.
- It only reads. Mercado Pago is never called.

## Endpoint

| Method | Path                                                                | Auth | Success | Errors                                                                     |
| ------ | ------------------------------------------------------------------- | ---- | ------- | -------------------------------------------------------------------------- |
| `GET`  | `/public/events/:slug/registrations/:registrationId/payment-status` | None | 200     | 400 `registrationId` is not a UUID, 404 unknown slug or registration, 429. |

Code: `apps/backend/src/payments/status/`. The pure rules are `decidePaymentStatus` and `maskEmail` in `payment-status.ts`.

## Response

```json
{
  "status": "confirmed",
  "firstName": "Ana",
  "maskedEmail": "a***@gmail.com",
  "folio": "LMP-2345",
  "passes": [
    { "name": "Pase completo Breaking", "competitions": ["Popping 1v1", "Breaking 1v1"] },
    { "name": "Open Styles", "competitions": [] }
  ],
  "totalCents": 220050
}
```

| Field         | Rule                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `status`      | See [Status](#status).                                                                               |
| `firstName`   | The participant's first name; the first word of the display name when only that is stored.           |
| `maskedEmail` | First character of the local part, `***`, then the whole domain (D1). `null` when there is no email. |
| `folio`       | Only when `status` is `confirmed`; otherwise `null`, also for a voided registration that had one.    |
| `passes`      | Pass names in purchase order, each with its selected competitions ordered by start time.             |
| `totalCents`  | Sum of the price snapshots stored on the registration.                                               |

Never returned: the full email, phone, last names, ids of other records, or any Mercado Pago data.

## Status

Derived from the registration and its most recently updated recorded payment (D4):

| `status`      | When                                                                                         | The page                     |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| `confirmed`   | The registration is `confirmed` (set only by the webhook or an admin).                       | Shows folio and passes.      |
| `pending`     | Still `pending_payment`, latest payment `pending`, `in_process` or `authorized` (OXXO/SPEI). | Explains the payment is due. |
| `rejected`    | Still `pending_payment`, latest payment `rejected` or `cancelled`.                           | Offers a retry (checkout).   |
| `confirming`  | Still `pending_payment` with no payment yet or any other status, `approved` included.        | Keeps polling.               |
| `unavailable` | The registration is `voided`.                                                                | Stops polling.               |

## Errors (400, 404)

A registration id that is not a UUID is a `400`. An unknown slug, an unknown registration, and a registration of another event all answer a neutral `404 { "statusCode": 404, "message": "...", "error": "Not Found" }` that never says where a registration belongs.

## Cross-references

- [Public registration](public-registration.md)
- [Public event catalog](public-event-catalog.md)
- Feature tasks: `odd/tasks/payment-result-screens.md`

## Known risks

- Anyone holding the return link sees the buyer's first name, masked email, passes and folio (D1). The UUID is not guessable, but a shared link shares this.
