# Mercado Pago Checkout Pro — issue #177

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/177 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Engram mirror: `odd/mercado-pago-checkout/tasks`
- Base: `dev` at `1b15308` (#199 merged)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #177`, `Closes #177` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `1b15308`. Review consent is granted without asking when RDD says a review is due on a newly finished task (user instruction).
- Working mode: the product owner asked for step-by-step guidance with plain-language explanations on this issue.

## Objective

Pay a `pending_payment` registration through Mercado Pago Checkout Pro (sandbox first) and confirm it only from a verified webhook followed by a server-side read of the payment.

## Decisions

- D1 (user, 2026-10-09) — Mercado Pago credentials (sandbox and production) must never be exposed in the repository: no real values in code, tests, docs, fixtures, logs or error messages. The repository is public.
- D2 (technical default) — Talk to the Mercado Pago REST API with Node's built-in `fetch` behind a small client interface, not the `mercadopago` SDK: two calls only (create preference, read payment), no new dependency, easy to stub in e2e.
- D3 (technical default) — One credential set per deployment: `MERCADO_PAGO_MODE` (`sandbox` or `production`), `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`. There are no paired test/production variables, so a deployment cannot hold both. `production` mode rejects a `TEST-` access token. Config errors name the variable, never its value.

- D4 (technical default) — Two payment tables, because one Checkout Pro preference can produce several payments (a rejected card followed by a retry on the same hosted page): `registration_checkouts` (one row per preference: registration, mode, preference id, amount, currency) and `registration_payments` (one row per Mercado Pago payment id: checkout, status, amount, currency). Currency is `MXN` only (Mexico-only MVP). Payment status stores Mercado Pago's own status vocabulary; mapping to registration state is T4.
- D5 (technical default) — Idempotency log `payment_webhook_notifications`, unique on the provider notification id, with the referenced payment id, receive and process timestamps and a short outcome code. No headers, signatures, bodies or payer data are stored.
- D6 (technical default) — T1 and T2 ship together in the first PR (about 400 authored lines in total); later tasks get their own stacked PRs.

- D7 (user, 2026-10-09) — Implement T3–T6 before publishing; publish the whole chain at the end as stacked PRs (T1+T2, T3, T4, T5+T6), as done for #176.
- D8 (technical default) — Checkout endpoint `POST /public/events/:slug/registrations/:registrationId/checkout`, rate limited like the other public routes. It only works for a `pending_payment` registration of that event and creates a new preference on each call (a retry after a rejection gets a fresh one). The amount is the sum of the registration's pass price snapshots; the preference sends one item per pass, `currency_id` `MXN`, `external_reference` = registration id, all three `back_urls` = `<PUBLIC_APP_URL>/e/:slug/pago?registration=<id>`, `auto_return` `approved`, and `notification_url` from config. No payer data is sent.
- D9 (technical default) — Two non-secret settings join the config: `PUBLIC_APP_URL` (buyer-facing frontend origin) and `MERCADO_PAGO_NOTIFICATION_URL` (public HTTPS webhook URL). The config is read once at startup by a Nest provider, so a missing or invalid value stops the app from booting; e2e specs get fake values from a Jest setup file.

- D10 (technical default, T3) — The checkout lives in `PaymentsModule` and registers its own stateless `PublicCatalogService` provider for the slug lookup; payments depends on events, never the reverse. No swagger decorators (no controller uses them). Answers: 404 for an unknown or other-event registration, 409 `registration_not_payable` for confirmed, voided or zero-total registrations, 502 `payment_provider_unavailable` when the provider fails (nothing written). Free passes are left out of the preference items. The client rejects a non-https checkout URL; sandbox allows an http notification URL for a local tunnel.

- D11 (technical default, T4) — Webhook `POST /public/payments/mercado-pago/webhook`, not rate limited (Mercado Pago retries in bursts).
  - **Signature:** `x-signature` is `ts=<ms>,v1=<hex>`. The manifest is `id:<data.id from the query, lowercased>;request-id:<x-request-id>;ts:<ts>;`, leaving out any missing part. It is checked with HMAC-SHA256 over the webhook secret and compared in constant time. A missing or invalid signature answers 401 and writes nothing. There is no timestamp window, because idempotency and the re-read make a replay harmless.
  - **Which notifications:** only `type` `payment` with a `data.id` is processed; other verified types answer 200 and are ignored.
  - **Idempotency:** the notification id is claimed in `payment_webhook_notifications`. A processed one answers 200 without work. An unprocessed one, left by a crash, is re-claimed.
  - **Re-read:** the payment is always read again by id (`GET /v1/payments/:id`), so out-of-order notifications act on the current state. A failed read answers 500 so Mercado Pago retries.
  - **Checks:** `external_reference` must be a registration that has a checkout in this mode. `live_mode` must match the configured mode. The currency must be `MXN` and the amount must equal the registration's pass snapshot total. A mismatch is recorded as an outcome and confirms nothing.
  - **Transaction:** the registration row is locked and the `registration_payments` row is upserted with `updated_at`. `approved` on a `pending_payment` registration confirms it with `approved_payment` plus a `payment_approval` audit row (actor `system`, provider payment id as the reference, no payer data). `approved` on an already confirmed registration is recorded as `approved_after_confirmation` for manual follow-up. Other statuses leave the registration pending. A confirmation is never undone.

- D12 (technical default, T4) — Only `data.id` is signed, so it alone drives the payment read; the unsigned body `type` and notification `id` only route. Notifications with a non-payment type, no notification id, or ids outside `^[A-Za-z0-9_-]{1,64}$` answer 200 and write nothing. Concurrency: claim insert on conflict do nothing before the read, then lock the claim row and the registration row inside the transaction. Extra outcomes: `already_confirmed` (same payment already approved this registration), `approved_after_void`, `unknown_status`, `payment_<status>`. Invalid currency, amount or status skip the payment upsert (table checks) but record the outcome. The `payment_approval` fact holds `{ providerPaymentId, checkoutId }` with the provider payment id as `reference`.

## Current state (exploration, 2026-10-09)

- Pending registrations come from `POST /public/events/:slug/registrations` (`apps/backend/src/events/public-registration/`); prices are snapshotted per pass in `event_registration_passes.price_cents`; no currency column, no stored total, no payment/provider table, no webhook log.
- `confirmRegistration(tx, { eventId, registrationId, source: 'approved_payment' })` (`apps/backend/src/events/registration-confirmation/confirm-registration.ts:30`) already confirms with a folio inside the caller's transaction and returns null when the registration is not pending.
- Audit already allows actor kind `system` and operation `payment_approval` with required `amount_cents` (`drizzle/0016_non_admin_audit_actor.sql`).
- Config: no config module; env is read from the repo-root `.env` (`src/database/environment.ts`) and validated by pure readers (`src/http/http-config.ts`) with specs.
- No HTTP client dependency; Node 24 has global `fetch`.
- Frontend: `public-reserved-page.tsx` is a temporary screen that #177 replaces with the redirect to Mercado Pago.
- `.env` and `.env.*` are git-ignored except `.env.example`. GitHub secret scanning and push protection are disabled on the repository.

## Tasks

- [x] T1 — Mercado Pago config reader: `readMercadoPagoConfig(env)` validates mode, access token and webhook secret; missing, blank or mixed values throw without echoing values; unit specs; README documents the variables with placeholders only. Route: delegated (2+ files). Evidence: RED (module missing) then GREEN 11/11; backend unit 155/155; lint clean; credential grep empty. `.env.example` still needs the three names with empty values (agent access blocked).
- [x] T2 — Schema: payment attempts (registration, preference id, payment id, status, amount, currency) and an idempotent webhook notification log; migration `0018`. Route: delegated (2+ files). Evidence: RED 5/5 (relations missing) then GREEN 5/5; full backend e2e 192/192 after bumping the hard-coded migration count in `event-activity-foundation.e2e-spec.ts`; unit 155/155; lint and build clean; credential grep empty.
- [x] T3 — Create a Checkout Pro preference for a pending registration (`external_reference`, return URLs); wire config at startup so the app fails to boot on bad credentials. Route: delegated (2+ files). Evidence: RED (unit 16 failed, e2e 7/7 `Cannot POST`) then GREEN (payments unit 42/42, e2e 7/7); backend unit 186/186, e2e 199/199; lint and build clean; credential grep empty. About 900 authored lines, half tests; one cohesive slice (config, client, module, endpoint). Note: `scripts/verify-setup.mjs` starts the backend, so the local `.env` now needs the Mercado Pago variables.
- [x] T4 — Webhook: verify `x-signature`, re-read the payment by id, map status, confirm with `approved_payment` + `payment_approval` audit, process each notification once; unit + PostgreSQL e2e with a stubbed client. Route: delegated (2+ files). Evidence: RED (unit 20 failed, e2e 14/14 404) then GREEN (payments unit 103/103, webhook e2e 14/14, stable over 3 more runs incl. concurrent duplicates); backend unit 247/247, e2e 214/214; lint, build and `tsc --noEmit` clean (the checkout stub needed `getPayment`); credential grep empty. About 680 production lines: signature, mapping, read and transactional service form one slice.
- [ ] T5 — Frontend: replace the temporary reserved screen with the redirect to Mercado Pago.
- [ ] T6 — Sandbox end-to-end purchase with test accounts; document the runbook.

## Acceptance criteria

See issue #177.

## Checks

- `pnpm --filter @nuestro-breaking/backend lint`, `test`, `test:e2e`; `pnpm verify:pr` when the frontend changes; `pnpm format`.
- Before every commit: no credential-shaped values in the diff.

## Progress

- 2026-10-09: exploration done; branch `feat/mercado-pago-config` from `1b15308`.
- 2026-10-09: T1 committed in `3606e68` (task doc `c23c452`). RDD assessed `high_risk`; consent granted (standing instruction); four-lens review approved and acknowledged (lineage `review-7472c0c4a5a1927f`). Reviewed boundary is now `c23c452`. Advisory suggestions only, not blocking: error messages repeat the mode list and the `TEST-` prefix literals; the `TEST-` check is case-sensitive.

- 2026-10-09: T2 committed in `9c39569` (doc `9af3a64`). RDD `high_risk`; consent granted (standing instruction); four-lens review approved and acknowledged (lineage `review-3972b7a0fb82920e`). Reviewed boundary is now `9af3a64`. Advisory, carried into T4: set `registration_payments.updated_at` on every status change; a notification row with `processed_at` null after a crash must be re-claimable on Mercado Pago's retry. Advisory, not adopted: a drizzle snapshot for `0018` (the repository stopped adding snapshots after `0002`).

- 2026-10-09: T3 committed (`feat(backend): create Mercado Pago checkout preferences…`). RDD `high_risk`; consent granted (standing instruction); four-lens review approved and acknowledged (lineage `review-f4f1b02029b484bd`). Follow-up commit closes two test gaps from the review: the stub's preference counter now resets per test, and a pending registration with no paid passes is proven to answer 409 (e2e 8/8). Carried into T4: a registration can be confirmed by cash between checkout and webhook, so an approved payment for a registration that is no longer pending must not confirm again and must be recorded with a distinct outcome for manual follow-up. Accepted as is: unlimited preferences per pending registration (the id is an unguessable uuid and the route is rate limited); boot fails without the Mercado Pago variables (required by the issue; each deployment must set them before this ships).

## Next step

T5.
