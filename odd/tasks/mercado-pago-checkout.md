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
- [ ] T3 — Create a Checkout Pro preference for a pending registration (`external_reference`, return URLs); wire config at startup so the app fails to boot on bad credentials.
- [ ] T4 — Webhook: verify `x-signature`, re-read the payment by id, map status, confirm with `approved_payment` + `payment_approval` audit, process each notification once; unit + PostgreSQL e2e with a stubbed client.
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

## Next step

T3.
