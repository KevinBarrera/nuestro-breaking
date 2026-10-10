# ADR 0007: Send Transactional Email Through Brevo

## Status

Accepted on 2026-10-10. The product owner chose the service.

## Context

Issue #179 sends a confirmation email to each online buyer once Mercado Pago confirms the payment. The backend has no mailer. The event sends a few hundred confirmations in total, so volume is low, but each email matters to the buyer. The repository is public, so no credential can live in it.

## Decision

Use Brevo's transactional email API: `POST https://api.brevo.com/v3/smtp/email` with a v3 API key in the `api-key` header. Brevo answers `201` with a `messageId`.

- The backend reads `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME` and `EMAIL_SANDBOX` at boot. A missing or malformed value stops the boot.
- Sandbox mode adds `X-Sib-Sandbox: drop`, so Brevo validates the message without delivering it. Brevo's guide (https://developers.brevo.com/docs/using-sandbox-mode) shows the header inside the JSON `headers` object, while community reports say it must be a real HTTP header. The sender sends it in both places. `EMAIL_SANDBOX` defaults to `true` unless `NODE_ENV` is `production`.
- Code depends on the `EmailSender` abstraction, never on Brevo directly. `BrevoEmailSender` is its only implementation.
- `429`, `5xx`, network failures and timeouts are retryable. `400`, `401` and `403` are not, since a person must fix the request or the credential. Errors never carry the API key, the recipient, the content or Brevo's response body.

## Why Brevo

- Its free plan has a daily limit (about 300 emails per day when this was decided) that covers the event's volume. Check current pricing before relying on it.
- A single HTTP call with an API key: no SDK and no new dependency.
- A sandbox mode lets development and tests exercise the real request without sending mail.

## Alternatives considered

- **Resend**: simple API, but its free plan caps at 100 emails per day.
- **Postmark**: the best deliverability record, but it has no lasting free plan.
- **Amazon SES**: the cheapest per email, but it needs an AWS account, sandbox exit approval and the heaviest setup.

## Consequences

- Real delivery needs a sender domain verified in Brevo (SPF and DKIM). The organization owns that step; until then only sandbox sending works.
- The API key lives only in the environment or the deployment's secret store, never in the repository.
- Switching providers means writing a new `EmailSender` implementation and its config; callers do not change.
