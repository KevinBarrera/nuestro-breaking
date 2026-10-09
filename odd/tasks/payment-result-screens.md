# Payment result screens — issue #178

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/178 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Engram mirror: `odd/payment-result-screens/tasks`
- Base: `dev` at `4ba430b` (#203 merged)
- Delivery strategy: stacked to `dev`, one PR per slice, following the #176 and #177 chains. `Refs #178` on each PR, `Closes #178` on the last one, no `Co-Authored-By`.
- Forecast: about 900 authored lines. Slice 1 is T1 (backend), slice 2 is T2 and T3 (frontend).
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `4ba430b`. Review consent is granted without asking when RDD says a review is due on a finished task (user instruction).

## Objective

After Mercado Pago sends the buyer back, show the real result of the payment: confirming, confirmed, pending (OXXO/SPEI) or rejected with a retry. The redirect never confirms anything; only the verified webhook does (#177).

## Decisions

- D1 (user, 2026-10-09) — The result screens show the buyer's first name and a masked email (`a***@gmail.com`), never the full email. Anyone holding the return link can see them.
- D2 (technical default) — The reference in the return URL stays the registration UUID (random, not guessable). No new token column or migration.
- D3 (technical default) — `GET /public/events/:slug/registrations/:registrationId/payment-status`, rate limited like the other public routes. It resolves the event by slug even after sales close. Unknown or other-event registrations answer a neutral 404.
- D4 (technical default) — The status is derived by a pure function:
  - registration `confirmed` → `confirmed`, with folio, passes, selected competitions and total;
  - registration `voided` → `unavailable`;
  - any payment `approved` → `confirming` (the webhook will confirm);
  - otherwise the newest payment by creation time decides: `pending`, `in_process` or `authorized` → `pending`; `rejected` or `cancelled` → `rejected`.
    Amended twice after review: ordering by last update let an expiring old voucher hide a newer payment in flight, and "any waiting payment wins" let an unpaid old voucher block the retry.
  - no payment yet, or any other status → `confirming`.
    `confirmed` comes only from the registration status the webhook sets.
- D5 (technical default) — Retry after a rejection calls the existing checkout endpoint, which creates a new preference for the same pending registration. When sales have closed, the existing checkout failure message is shown.
- D6 (technical default) — The organizer contact email is not known yet, so the rejected screen leaves out the "Escríbenos a …" line.
- D7 (technical default) — Polling: every 3 s, at most 20 tries (about 60 s, under the public rate limit). After that, or after a network error or 429, the page shows a "taking longer" message with a "Revisar de nuevo" button.

## Tasks

- [x] T1 — Backend payment status endpoint: pure status decision with unit spec, controller and service in `payments/status/`, PostgreSQL e2e spec, contract doc `docs/contracts/public-payment-status.md`. Route: delegated (backend, several non-trivial files).
- [ ] T2 — Frontend API reader and polling model: `getPaymentStatus` with reader tests, pure polling state machine with Vitest. Route: delegated together with T3.
- [ ] T3 — Return page views (confirming, confirmed, pending, rejected, taking longer, unavailable), Playwright specs for each state and retry, phone-width sweep, plan doc update. Route: delegated.

## Acceptance criteria

See issue #178.

## Checks

- Backend: `pnpm --filter @nuestro-breaking/backend lint`, `test`, `test:e2e`.
- Frontend: `pnpm verify:pr`.

## Progress

- 2026-10-09 — Exploration done; D1 decided by the user.
- 2026-10-09 — T1 done (delegated writer). Deviations: `maskedEmail` is `null` when the participant has no email (manual registrations); `firstName` falls back to the first word of `full_name`; competitions ordered by start time, then name. Checks: backend lint passed; unit 21 suites / 284 tests passed; e2e 25 suites / 238 tests passed; parent spot check `jest src/payments/status` 18/18 passed. Next: T2 and T3.
