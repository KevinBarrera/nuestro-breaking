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
- D7 (user, 2026-10-10) — Email copy approved. The event name in the email is `events.name`; the organization will name the event "Los más pesados - Preliminares - Noviembre 2026" in the admin panel so future events stay distinct.
- D6 (external) — Real delivery needs a sender domain verified in Brevo by the organization. Until then only sandbox sending works.

## Tasks

- [x] T1 — Provider foundation: ADR `docs/adr/0007-email-delivery-service.md`, email config reader with spec, `EmailSender` abstract token, `BrevoEmailSender` fetch implementation with spec (sandbox header, error mapping, no secrets in errors), module wiring, fake env in `test/support/e2e-env.ts`. Route: delegated (several non-trivial files).
- [x] T2 — Outbox: `registration_confirmation_emails` schema and migration `0019`, insert in `PaymentWebhookService.confirm` in the same transaction, PostgreSQL e2e proving exactly one row per confirmation across webhook retries and OXXO/SPEI later approval, and none for cash confirmation. Also document the four email env vars in the README now (review R3-boot-gate: since T1 the backend refuses to boot without them). Route: delegated.
- [x] T3 — Content and dispatch: pure Spanish content builder with Jest spec, dispatcher (immediate try after commit, periodic retry with backoff, max attempts, logging without personal data), Jest specs with a stubbed `EmailSender` for content, idempotency and failure without rollback. Includes the T1 review suggestions: e2e must force `EMAIL_SANDBOX=true` and a fake key even when the shell exports real values; consume or cancel the response body on non-2xx; treat 408 as retryable. Route: delegated.
- [x] T4 — Docs: contract `docs/contracts/confirmation-email.md`, Brevo runbook, plan update. Route: delegated with T3.
- [x] T5 — T3 review follow-ups (user chose to fix before publishing): per-row lease or claim one row at a time so a slow batch cannot outlive its lease (R4/R3 batch lease); `record()` reports whether the fence matched and logs name stale results (R2); runbook log patterns match the real messages (R2); typed delivery codes and distinct `not_confirmed` cases (R2); wait for in-flight sends in `beforeApplicationShutdown` (R3); deterministic stale-lease test instead of a fixed 100 ms wait (R3); unit test for backoff doubling and cap (R3). Route: delegated.

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

- 2026-10-10 — T3 done (delegated writer): `buildConfirmationEmail` (Spanish, escaped HTML plus text, no payment data), `ConfirmationEmailDispatcher` (claim with a 2 min lease via `FOR UPDATE SKIP LOCKED`, send outside any transaction, results fenced by attempt number, backoff 1 min doubling to 1 h, 8 attempts, `failed` plus an error log with id and code only), `ConfirmationEmailSweeper` (`EMAIL_DISPATCH_INTERVAL_MS`, default 60000, `0` off, no overlap, unref'd timer, waits for in-flight sends on shutdown), the webhook's fire-and-forget immediate dispatch after commit, typed `CONFIRMATION_EMAIL_STATUSES` (no migration), shared `readRegistrationPasses`/`displayFirstName` reused by the payment status service, Brevo body release on non-2xx and 408 retryable, e2e env forcing a fake key, sandbox and interval `0`. The webhook e2e stubs the dispatcher; the new `confirmation-email-dispatch.e2e-spec.ts` (12 tests) stubs `EmailSender` and covers one send with folio, passes and competitions, duplicates, OXXO/SPEI later approval, transient and unexpected failures with backoff and a later sweep, rejection, max attempts, missing recipient, concurrent claims, no resend, the stale-lease fence and the rollback after enqueue (R3, via a trigger failing the webhook's final write). RED observed for the unit specs (missing content module, 12 failing config and Brevo cases), then GREEN; the e2e spec was written after the dispatcher and passed first run, and a mutation check (dropping the attempt fence) made the stale-lease test fail. Checks: `pnpm format`, backend lint, Jest (343 passed), build, full backend e2e (257 passed; one earlier full run had a single `event-foundation` failure that passed alone and in a rerun).
- 2026-10-10 — T4 done (delegated writer): contract `docs/contracts/confirmation-email.md`, runbook `docs/runbooks/email-delivery.md` (Brevo setup, delivery checks, SQL to list and requeue), README `EMAIL_DISPATCH_INTERVAL_MS` and runbook link, plan current-state line and buyer flow step. Checks: `pnpm format`.
- 2026-10-10 — T3 commit `fda7471`, T4 commit `e01ff6f`. RDD assess: high, `high_risk`; review granted (standing user instruction), four lenses approved and acknowledged, with 6 warnings and 3 suggestions. The user chose to fix them before publishing (T5). A hook-issued review of the whole range since `c9c9441` was granted by the user but refused with `lens_context_budget_exceeded`; the per-task reviews are the reduced scope.
- 2026-10-10 — T5 done (delegated writer). Per finding: batch lease (R4, R3) fixed, `sweep()` claims one row at a time right before its send, keeping `FOR UPDATE SKIP LOCKED` and the attempt fence; misleading logs (R2) fixed, `record()` returns whether the fence matched and a stale worker logs `... finished after its lease expired; result ignored.`; runbook log patterns (R2) fixed, runbook and contract quote the final messages (`marked failed` error, `retry scheduled` warning, stale warning, sweep/dispatch query errors); typed codes (R2) fixed, `ConfirmationEmailErrorCode = EmailSendErrorCode | DispatchErrorCode` with a typed `Outcome` passed to `record()`; `not_confirmed` (R2) split into `registration_missing`, `not_confirmed` and `missing_folio` (pure `checkSendable`), runbook rows added; shutdown order (R3) verified, not moved: Nest 11.1.28 `close()` runs every `onModuleDestroy` (reverse import depth, so `NotificationsModule` before `DatabaseModule`, whose `DatabaseService` ends the pool there) and only then `beforeApplicationShutdown`, so moving the wait would close the pool first; the wait stays in `onModuleDestroy`, the comment now states this, and an e2e shutdown test with a send in flight proves the order (a mutation moving the wait to `beforeApplicationShutdown` failed it); `main.ts` calls `app.enableShutdownHooks()`; stale-lease timing (R3) fixed, the test waits on a promise resolved when the first send starts; backoff cap (R3) fixed, `retryDelaySeconds` moved to pure `confirmation-email-policy.ts` with a unit test for attempts 1, 2, 3, 6, 7, 8 and 50. RED observed: missing policy module, and 3 e2e failures (stale log, per-row lease, log wording); the shutdown and `not_confirmed` e2e tests passed on the old code as characterization. GREEN after the fix. Checks: `pnpm format`, backend lint, Jest (353 passed), build, full backend e2e (261 passed), dispatch e2e 3 more runs (16 passed each).
- 2026-10-10 — T5 commit `3aad79a`. RDD assess: medium, `slice_budget_reached`; review granted (standing user instruction), reliability lens approved and acknowledged with one suggestion (no test for a late worker whose stale result was `sent`). Reviewed boundary is now `3aad79a`.

## Next step

Publish the three stacked PRs (`Refs #179`, the last one `Closes #179`).
