# Flagged payments contract

This contract describes the admin list of Mercado Pago payments that the system recorded but could not settle on its own (issue #230). The endpoint below is implemented and covered by backend e2e tests (`apps/backend/test/admin-flagged-payments.e2e-spec.ts`). Refunds and registration changes stay outside this list: refunds happen in Mercado Pago, and corrections belong to #104/#105.

## Current answer

- The Mercado Pago payment webhook (#177) and the payment reconciliation sweep (#181) store every Mercado Pago payment they read. When an approved payment cannot confirm its registration, its notification `outcome` flags it for manual review.
- The list shows **one row per Mercado Pago payment**: the payment's **latest processed outcome**, across all its notifications. A payment appears only while that latest outcome is flagged. If a later notification gives it another outcome (for example `payment_refunded` after coordination refunds it in Mercado Pago), it drops off the list. A later failed read of the payment (`payment_not_found`, `payment_unreadable`) is not an outcome of the payment, so it never hides a flagged one.
- Payments that confirmed a registration normally (`confirmed`, `confirmed_after_expiry`, `already_confirmed`) and payments that were never approved never appear.
- No payer data from Mercado Pago is stored or shown. The row only carries what the registration already holds.

## Flagged reasons

| `reason`                            | Meaning                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `approved_after_expiry_duplicate`   | Approved after the registration expired, and the same person already holds another registration (likely paid twice). |
| `approved_after_expiry_event_ended` | Approved after the registration expired, once the event had ended.                                                   |
| `approved_after_confirmation`       | Approved for a registration already confirmed by another payment or by cash.                                         |
| `approved_after_void`               | Approved for a registration voided for a reason other than expiry.                                                   |

The codes are decided in `apps/backend/src/payments/webhook/payment-decision.ts`; the [audit policy](admin-registration-audit-policy.md) explains when an approval writes no audit fact.

## Admin API

`GET /admin/events/:eventId/flagged-payments` uses the [admin authentication boundary](admin-auth-boundary.md). Code: `apps/backend/src/payments/review/`.

```json
{
  "payments": [
    {
      "providerPaymentId": "1234567890",
      "reason": "approved_after_expiry_duplicate",
      "receivedAt": "2026-11-02T18:04:00.000Z",
      "amountCents": 150000,
      "registration": {
        "id": "7c0a…",
        "folio": null,
        "participantName": "Ana López",
        "status": "voided"
      }
    }
  ]
}
```

- `receivedAt` is when the system first recorded the payment (`registration_payments.created_at`), ISO 8601 in UTC. The list is ordered by it, newest first.
- `amountCents` is the amount Mercado Pago charged, in MXN cents.
- `registration.folio` is `null` when the registration never had one (an expired online registration). `registration.status` is `pending_payment`, `confirmed` or `voided`.
- An event with nothing to review returns `{ "payments": [] }`.

| Method | Auth                                          | Errors                                                         |
| ------ | --------------------------------------------- | -------------------------------------------------------------- |
| `GET`  | Admin session for the event (or global admin) | 401 without an admin session for the event; 404 unknown event. |

Judges and administrators of other events get 401. Like other admin reads, the `GET` needs no CSRF token.

## Admin UI

**Pagos por revisar** (`/admin/events/:eventId/payments-review`) sits in the event's side navigation under Operación, with a count badge when there are payments to review. A table lists one row per payment, newest first: arrival time (in the browser's time zone), the case (a plain Spanish title per reason), the person with the folio ("Sin folio" when there is none), registration status, amount and Mercado Pago payment id. Above it, "Qué hacer en cada caso" explains each reason present once, with its count, and what coordination should do, so the screen still reads well with many payments. On narrow screens the table scrolls inside its own box. With nothing to review it says "No hay pagos por revisar." A failed read shows safe copy only. The screen changes nothing. Code: `apps/frontend/src/pages/admin/ui/admin-payments-review-page.tsx` and `payments-review-model.ts`; the API client is `apps/frontend/src/entities/flagged-payments`.

## Data sources

Read only; no migration. The list joins `payment_webhook_notifications` (latest processed `outcome` per `provider_payment_id`) → `registration_payments` → `registration_checkouts` → `event_registrations` → `participants`, filtered by the event.
