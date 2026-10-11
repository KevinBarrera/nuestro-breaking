# Confirmation email contract

This contract describes the email an online buyer receives when their registration is confirmed, for issue #179. Only the verified Mercado Pago webhook (#177) queues it, and each registration gets at most one. A send failure never undoes the confirmation: the email is retried and, if it still fails, reported. The provider is Brevo ([ADR 0007](../adr/0007-email-delivery-service.md)). It is implemented and covered by backend unit and e2e tests. Operating it (Brevo setup, checking delivery, requeueing) is in the [email delivery runbook](../runbooks/email-delivery.md).

## When it is sent

| Event                                                                         | Email?                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| The webhook confirms a `pending_payment` registration with `approved_payment` | Yes, once.                                  |
| An OXXO/SPEI payment is approved later and the webhook then confirms          | Yes, once, the same email.                  |
| Mercado Pago retries the notification, or sends another one for the payment   | No: the registration already has its email. |
| An admin confirms the registration with cash                                  | No.                                         |
| An approval arrives for a registration already confirmed with cash            | No.                                         |
| The confirmation transaction fails and rolls back                             | No: the queued email rolls back with it.    |

The buyer's return to our site plays no part: only the webhook confirms.

## How it is delivered

1. In the same transaction that confirms the registration, the webhook inserts one row in `registration_confirmation_emails` (status `pending`). A unique `registration_id` makes this the once-per-registration guarantee.
2. Right after that transaction commits, the backend tries to send it. The webhook answers Mercado Pago without waiting for the send, and a send error never changes its answer.
3. A periodic sweep inside the backend retries every row that is still due.

Code: `apps/backend/src/notifications/` (`ConfirmationEmailDispatcher`, `ConfirmationEmailSweeper`, `buildConfirmationEmail`).

### Claiming, retries and failure

| Rule           | Value                                                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim          | A worker claims one due row (`pending`, `next_attempt_at <= now()`) right before its send, with `FOR UPDATE SKIP LOCKED`, counts the attempt and moves `next_attempt_at` forward by the lease. No lock is held while Brevo is called.                                                                                         |
| Lease          | 2 minutes per row, well above Brevo's 10 s request timeout. A sweep claims its rows one at a time, so a slow batch cannot outlive a lease. Another worker only takes the row again if the first one died or stalled mid-send.                                                                                                 |
| Fencing        | The result is written only while the row is still `pending` with the claim's attempt number, so a late worker never overwrites a newer outcome and a `sent` row is never sent again. The late worker logs its result as ignored.                                                                                              |
| Retry          | Network errors, timeouts, 408, 429, 5xx and unexpected errors are retried: 1 min after the first attempt, then doubling, capped at 1 hour.                                                                                                                                                                                    |
| Max attempts   | 8. The eighth failure marks the row `failed`.                                                                                                                                                                                                                                                                                 |
| Final failures | 400, 401, 403 and other 4xx answers, a buyer without an email address (`missing_recipient`), a registration that is no longer confirmed (`not_confirmed`), a confirmed registration without a folio (`missing_folio`) or a missing registration, participant or event (`registration_missing`) mark the row `failed` at once. |
| Sweep          | Every `EMAIL_DISPATCH_INTERVAL_MS` (default 60000), up to 20 rows per sweep, never two sweeps at once. `0` turns it off (e2e does this).                                                                                                                                                                                      |

A row keeps only delivery state: `status` (`pending`, `sent` or `failed`), `attempts`, `next_attempt_at`, `last_error_code`, `provider_message_id` and `sent_at`. No address, name or message body is stored.

### Failure reporting

- A `failed` row stays in the table for manual follow-up; the runbook has the SQL to list and requeue it.
- The backend logs an error for each row it marks `failed` (`Confirmation email for registration <id> marked failed (<code>) after <n> attempt(s); it needs manual follow-up.`), a warning for each retried attempt (`... attempt <n> failed (<code>); retry scheduled.`) and a warning when a late result is ignored (`... attempt <n> finished after its lease expired; result ignored.`).
- Logs and `last_error_code` hold the registration id, the attempt number and a fixed code only (`network`, `rate_limited`, `provider_unavailable`, `unauthorized`, `rejected`, `registration_missing`, `not_confirmed`, `missing_folio`, `missing_recipient`, `unexpected`). Never names, addresses, subjects, bodies, the API key or Brevo's answer.
- On shutdown the backend waits for in-flight sends before it closes the database pool, so their results are recorded.

## Content

The email is in Spanish and is built when it is sent, from the database. Sample:

```text
Subject: Tu inscripción a Los más pesados está confirmada · Folio LMP-AB12

Hola, Ana:

Tu inscripción a Los más pesados está confirmada. ¡Gracias por ser parte!

Fecha: viernes, 20 de noviembre de 2026, 9:00 a.m.

Tu folio: LMP-AB12
Muestra este folio en la entrada del evento para recibir tu acceso.

Tus pases:
- Pase completo Breaking
  Competencias: Popping 1v1, Breaking 1v1
- Open Styles

¡Nos vemos en Los más pesados!
```

| Field     | Rule                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Greeting  | The participant's first name; the first word of the display name when only that is stored.                                   |
| Event     | The event name.                                                                                                              |
| Date      | The event start in the event's time zone. Left out when the event has no start date.                                         |
| Folio     | Shown prominently, with a line asking the buyer to show it at the entrance.                                                  |
| Passes    | Pass names in purchase order, each with its selected competitions ordered by start time; none listed when the pass has none. |
| Recipient | The participant's email, with their display name.                                                                            |

Every message has a plain-text and an HTML body with the same content. The HTML uses inline styles, loads no external assets, and escapes every name, because names come from buyers and admins.

Never included: amounts, prices or totals, payment ids, the payment method, Mercado Pago data, the buyer's email address (masked or not) in the body, or organizer contact details (still unknown, as in #178 D6).

## Configuration

| Variable                     | Rule                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `BREVO_API_KEY`              | Required. Brevo v3 API key.                                                                                             |
| `EMAIL_SENDER_ADDRESS`       | Required. From address; its domain must be verified in Brevo for real delivery.                                         |
| `EMAIL_SENDER_NAME`          | Required. From name.                                                                                                    |
| `EMAIL_SANDBOX`              | `true` or `false`. `true` makes Brevo validate and drop every message. Defaults to `true` unless `NODE_ENV=production`. |
| `EMAIL_DISPATCH_INTERVAL_MS` | Optional. Sweep interval: `0` (off) or 1000 to 86400000. Defaults to 60000.                                             |

A missing or invalid value stops the backend at boot; the error names the variable, never its value. The e2e setup (`apps/backend/test/support/e2e-env.ts`) always forces a fake key, `EMAIL_SANDBOX=true` and `EMAIL_DISPATCH_INTERVAL_MS=0`, even when the shell exports real values.
