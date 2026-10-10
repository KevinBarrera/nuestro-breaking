# Confirmation emails — issue #179

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/179 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Engram mirror: `odd/confirmation-emails/tasks`
- Base: `dev` at `7a3d6a0` (#207 merged)
- Delivery strategy: stacked to `dev`, one PR per slice, following the #177 and #178 chains. `Refs #179` on each PR, `Closes #179` on the last one, no `Co-Authored-By`.
- Forecast: about 1,000 authored lines. Slice 1 is T1 (provider foundation), slice 2 is T2 (outbox), slice 3 is T3 and T4 (dispatch and docs).
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `7a3d6a0`. Review consent is granted without asking when RDD says a review is due on a finished task (user instruction).

## Objective

Send one confirmation email, in Spanish, to an online buyer when the verified Mercado Pago webhook confirms their registration, including an OXXO/SPEI payment approved later. A send failure never rolls back the confirmation; it is retried and reported.

## Current state (explored 2026-10-10)

- The only online confirmation path is `PaymentWebhookService.confirm` (`apps/backend/src/payments/webhook/payment-webhook.service.ts`), inside the webhook's single transaction with an advisory lock. It runs at most once per registration; webhook retries end as `already_confirmed`.
- `confirmRegistration` is shared with cash confirmation (`source: 'admin_cash'`), so the email hook belongs in the webhook path, not in `confirmRegistration`.
- No mailer, queue, scheduler or outbox exists. External clients use an abstract-class DI token (`MercadoPagoClient`) with a fetch implementation and a config reader that fails boot on bad values.
- `participants.email` and `participants.first_name` are nullable; online registrations always have an email.

## Decisions

- D1 (user, 2026-10-10) — Email service: Brevo transactional API (`POST https://api.brevo.com/v3/smtp/email`, `api-key` header, v3 API key). Recorded in ADR 0007.
- D2 (technical default) — Transactional outbox: the webhook's `confirm` inserts one `registration_confirmation_emails` row in the same transaction. A unique `registration_id` makes it idempotent. No email is sent inside the transaction.
- D3 (technical default) — Dispatch: after the webhook commits, the dispatcher tries the pending row right away; a periodic sweep inside the backend process retries failed rows with backoff, claiming rows with `FOR UPDATE SKIP LOCKED`. After a maximum number of attempts the row is marked `failed` and logged for manual follow-up. No new queue dependency.
- D4 (technical default) — Content is built when sending, from the database: first name (fallback to the first word of the full name), event name and date, folio, passes with their selected competitions. No amounts, payment ids or payment method.
- D5 (technical default) — Sandbox: in development the sender adds Brevo's sandbox header (`X-Sib-Sandbox: drop`), so nothing is delivered. Config: `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`, `EMAIL_SANDBOX`.
- D6 (external) — Real delivery needs a sender domain verified in Brevo by the organization. Until then only sandbox sending works.

## Tasks

- [x] T1 — Provider foundation: ADR `docs/adr/0007-email-delivery-service.md`, email config reader with spec, `EmailSender` abstract token, `BrevoEmailSender` fetch implementation with spec (sandbox header, error mapping, no secrets in errors), module wiring, fake env in `test/support/e2e-env.ts`. Route: delegated (several non-trivial files).
- [x] T2 — Outbox: `registration_confirmation_emails` schema and migration `0019`, insert in `PaymentWebhookService.confirm` in the same transaction, PostgreSQL e2e proving exactly one row per confirmation across webhook retries and OXXO/SPEI later approval, and none for cash confirmation. Also document the four email env vars in the README now (review R3-boot-gate: since T1 the backend refuses to boot without them). Route: delegated.
- [ ] T3 — Content and dispatch: pure Spanish content builder with Jest spec, dispatcher (immediate try after commit, periodic retry with backoff, max attempts, logging without personal data), Jest specs with a stubbed `EmailSender` for content, idempotency and failure without rollback. Includes the T1 review suggestions: e2e must force `EMAIL_SANDBOX=true` and a fake key even when the shell exports real values; consume or cancel the response body on non-2xx; treat 408 as retryable. Route: delegated.
- [ ] T4 — Docs: contract `docs/contracts/confirmation-email.md`, Brevo runbook, plan update. Route: delegated with T3.

## Acceptance criteria

From #179:

- An ADR records the chosen email service and why.
- Confirming a registration sends exactly one email with folio, passes and competitions.
- A later approval of a pending payment sends the same confirmation email.
- A send failure does not roll back the confirmation and is retried or reported.
- Jest specs cover content and idempotency with a stubbed transport.

## Checks

- `pnpm --filter @nuestro-breaking/backend lint`
- `pnpm --filter @nuestro-breaking/backend test`
- `pnpm --filter @nuestro-breaking/backend test:e2e` (Docker)
- `pnpm format`

## Progress

- 2026-10-10 — Exploration done, D1 chosen by the user, branch `feat/179-01-email-foundation` created from `dev` at `7a3d6a0`.
- 2026-10-10 — T1 done (delegated writer): ADR 0007, `apps/backend/src/notifications` (`readEmailConfig`, `EmailSender`, `EmailSendError`, `BrevoEmailSender`, `NotificationsModule` in `AppModule`), fake e2e env. RED observed (missing modules), then GREEN. Checks: backend lint, Jest (318 passed), build, `pnpm format`, and the `payment-webhook` e2e (24 passed, AppModule boots). Sandbox header is sent both as an HTTP header and in the payload `headers` object. `.env.example` not touched; env vars go to the README in T2.
- 2026-10-10 — T1 commit `ceca34c`. RDD assess: medium, `slice_budget_reached`; review granted (standing user instruction), reliability lens approved and acknowledged (lineage `review-b56572ec6f9af5dc`). Advisory findings: boot gate before docs (WARNING, moved to T2), e2e sandbox overridable, unconsumed error body, 408 not retryable (all moved to T3). Reviewed boundary is now `ceca34c`.
- 2026-10-10 — T2 done (delegated writer): `registration_confirmation_emails` schema (`schema/notifications.ts`) and migration `0019`, `enqueueConfirmationEmail` in `apps/backend/src/notifications` called from `PaymentWebhookService.confirm` after the audit insert, README section for the four email env vars. Six outbox e2e tests in `payment-webhook.e2e-spec.ts` (approval, duplicate and different notifications, OXXO/SPEI later approval, rejected, cash confirmation, approval after cash). RED observed (missing relation), then GREEN. Deviation: `db:generate` diffed against the stale `0002` snapshot, so the generated snapshot was dropped and `0019` was hand-written like `0003`–`0018`; the migration count in `event-activity-foundation.e2e-spec.ts` went to 20. Checks: `pnpm format`, backend lint, Jest (318 passed), build, full backend e2e (245 passed).
- 2026-10-10 — T2 commit `54d2a86`. RDD assess: high, `high_risk`; review granted (standing user instruction), four lenses approved and acknowledged. Advisory suggestions moved to T3: claim rows with a lease instead of holding a lock across the Brevo call (R4), typed status values (R2), dispatcher comments present tense only once it exists (R2), rollback test proving no row survives an aborted confirmation (R3). Reviewed boundary is now `54d2a86`.

## Next step

T3 and T4 on `feat/179-03-confirmation-dispatch`, stacked on `feat/179-02-confirmation-outbox`.
