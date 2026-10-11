# Email Delivery Runbook

This guide covers the confirmation email online buyers receive
([#179](https://github.com/KevinBarrera/nuestro-breaking/issues/179)): setting
up Brevo for the organization, checking that emails go out, and resending one
that failed. What the email contains and when it is sent is in the
[confirmation email contract](../contracts/confirmation-email.md); why Brevo is
in [ADR 0007](../adr/0007-email-delivery-service.md).

Never put real API keys, account details or buyer data in this repository: it
is public. Real values live only in your local `.env` or the deployment's
secret store.

## How it fits together

1. When the Mercado Pago webhook confirms a registration, it also queues one
   email row in `registration_confirmation_emails`, in the same transaction.
2. Right after that, the backend sends the email through Brevo.
3. If Brevo is down or slow, the row stays `pending` and a sweep inside the
   backend retries it (1 min, then doubling up to 1 hour, at most 8 attempts).
4. If it still fails, or Brevo refuses it, the row becomes `failed` and the
   backend logs an error with the registration id and a short code.

Cash confirmations never send an email.

## 1. One-time Brevo setup

The organization does this once. Menu names in Brevo may change; look for the
same idea if a name differs.

1. Create a Brevo account for the organization (not a personal one), so access
   survives people changing roles.
2. Add the sender domain (the part after `@` in `EMAIL_SENDER_ADDRESS`, for
   example `tickets.example`) under **Senders, Domains & Dedicated IPs →
   Domains**.
3. Brevo shows DNS records for that domain. Ask whoever manages the domain's
   DNS to add them: the **DKIM** record, the **SPF** entry (add Brevo's
   `include:` to the existing SPF record instead of creating a second one) and
   the Brevo code record. A **DMARC** record is recommended.
4. Wait until Brevo marks the domain **authenticated**. DNS changes can take
   hours.
5. Add the sender address itself under **Senders** if Brevo asks for it.
6. Create a **v3 API key** under **SMTP & API → API keys**. Copy it once into
   the secret store; Brevo will not show it again.

Until step 4 is done, only sandbox sending works: keep `EMAIL_SANDBOX=true`.

## 2. Environment variables

Set these in the deployment's secret store (or your local `.env`). See the
README section "Email delivery (Brevo)" for details.

| Variable                     | Value                                                                    |
| ---------------------------- | ------------------------------------------------------------------------ |
| `BREVO_API_KEY`              | The v3 API key from step 1.6.                                            |
| `EMAIL_SENDER_ADDRESS`       | An address on the authenticated domain, for example `boletos@<domain>`.  |
| `EMAIL_SENDER_NAME`          | The name buyers see, for example `Los más pesados`.                      |
| `EMAIL_SANDBOX`              | `true` until the domain is authenticated, then `false` in production.    |
| `EMAIL_DISPATCH_INTERVAL_MS` | Optional. How often pending emails are retried. Default `60000` (1 min). |

Restart the backend after changing any of them. A missing or invalid value
stops the boot; the error names the variable, never its value.

With `EMAIL_SANDBOX=true`, Brevo checks each message and drops it: nothing
reaches an inbox, but the backend still records the row as `sent`.

## 3. Check delivery

1. In Brevo, open **Transactional → Logs** (or **Statistics**). Search by the
   buyer's address to see whether the message was sent, delivered, bounced or
   marked as spam. Sandbox messages do not appear as delivered.
2. In the database, check the email row of a registration (replace the
   container name and the registration id):

```bash
docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT status, attempts, last_error_code, next_attempt_at, sent_at, provider_message_id FROM registration_confirmation_emails WHERE registration_id = '"'"'<registration-id>'"'"';"'
```

`provider_message_id` is Brevo's id for the message; it matches the message id
in Brevo's logs.

## 4. Find emails that need attention

Run these in `psql` (for example `docker exec -it <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`).

```sql
-- Failed emails: they will not be retried on their own.
SELECT e.registration_id, r.folio, e.attempts, e.last_error_code, e.updated_at
FROM registration_confirmation_emails e
JOIN event_registrations r ON r.id = e.registration_id
WHERE e.status = 'failed'
ORDER BY e.updated_at DESC;

-- Emails still pending after 15 minutes: retrying, or the sweep is off.
SELECT registration_id, attempts, last_error_code, next_attempt_at, created_at
FROM registration_confirmation_emails
WHERE status = 'pending' AND created_at < now() - interval '15 minutes'
ORDER BY created_at;
```

| `last_error_code`      | What it means and what to do                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `unauthorized`         | Brevo rejected the API key. Check `BREVO_API_KEY`, restart, then requeue.                                      |
| `rejected`             | Brevo refused the message, often an unauthenticated sender domain or an invalid recipient. Check Brevo's logs. |
| `missing_recipient`    | The participant has no email address. Correct the participant's address, then requeue.                         |
| `not_confirmed`        | The registration was not confirmed when sending (for example voided). Usually nothing to do.                   |
| `missing_folio`        | A confirmed registration has no folio. A data defect the database should prevent; report it to a developer.    |
| `registration_missing` | The registration, its participant or its event was not found. A data defect; report it to a developer.         |
| `rate_limited`         | Brevo asked us to slow down. Retried on its own.                                                               |
| `provider_unavailable` | Brevo answered with an error or timed out. Retried on its own.                                                 |
| `network`              | Brevo could not be reached. Retried on its own; check the server's outbound network if it keeps happening.     |
| `unexpected`           | Something else failed. Retried on its own; check the backend log around `updated_at`.                          |

## 5. Requeue an email

After fixing the cause, put the row back in the queue. The next sweep (within
`EMAIL_DISPATCH_INTERVAL_MS`) sends it. Resetting `attempts` gives it the full
8 tries again.

```sql
UPDATE registration_confirmation_emails
SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error_code = NULL,
  updated_at = now()
WHERE registration_id = '<registration-id>' AND status = 'failed';
```

Only requeue `failed` rows. Never requeue a `sent` row: the buyer would get the
email twice. If the sweep is off (`EMAIL_DISPATCH_INTERVAL_MS=0`), the row waits
until it is turned back on.

## Troubleshooting

| What you see                                                                                          | What it means and what to do                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend refuses to start                                                                              | An email variable is missing or invalid. The error names the variable.                                                                                            |
| Rows are `sent` but no email arrives                                                                  | `EMAIL_SANDBOX` is `true`, or Brevo bounced it. Check the variable and Brevo's logs.                                                                              |
| Every row fails with `rejected` after going live                                                      | The sender domain is not authenticated in Brevo yet. Finish step 1, or go back to `EMAIL_SANDBOX=true`.                                                           |
| Rows stay `pending` with no attempts                                                                  | The immediate send did not run and the sweep is off. Check `EMAIL_DISPATCH_INTERVAL_MS` is not `0`.                                                               |
| Error log `... marked failed (<code>) ...`                                                            | The row is now `failed`. Use section 4 to find it and section 5 to requeue it after the fix.                                                                      |
| Warning log `... attempt N failed (<code>); retry scheduled.`                                         | One attempt failed and the row is still `pending`. Nothing to do unless it ends `failed`.                                                                         |
| Warning log `... finished after its lease expired; result ignored.`                                   | A slow send outlived its 2 minute lease and another attempt took the row. Check the row's `status`; if it is `sent`, the buyer may have received the email twice. |
| Error log `Confirmation email sweep failed (...)` or `... dispatch for registration ... failed (...)` | The database query failed, not the email. The row stays `pending` and the next sweep retries it.                                                                  |

## Going to production

- [ ] The sender domain is **authenticated** in the organization's Brevo account.
- [ ] `BREVO_API_KEY` belongs to that account and is in the secret store.
- [ ] `EMAIL_SENDER_ADDRESS` uses the authenticated domain.
- [ ] `EMAIL_SANDBOX=false`.
- [ ] One test purchase in production delivers the email to a real inbox, and its row is `sent`.
