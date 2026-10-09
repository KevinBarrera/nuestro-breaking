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
- D8 (user, 2026-10-09) — When an older OXXO/SPEI voucher is still unpaid and a newer attempt was rejected, the page shows `rejected` and allows a retry. If the buyer later pays both, the webhook already records `approved_after_confirmation` for manual follow-up, and the organization refunds outside the system.
- D7 (technical default) — Polling: every 3 s, at most 20 tries (about 60 s, under the public rate limit). After that, or after a network error or 429, the page shows a "taking longer" message with a "Revisar de nuevo" button.

## Tasks

- [x] T1 — Backend payment status endpoint: pure status decision with unit spec, controller and service in `payments/status/`, PostgreSQL e2e spec, contract doc `docs/contracts/public-payment-status.md`. Route: delegated (backend, several non-trivial files).
- [x] T2 — Frontend API reader and polling model: `getPaymentStatus` with reader tests, pure polling state machine with Vitest. Route: delegated together with T3.
- [x] T3 — Return page views (confirming, confirmed, pending, rejected, taking longer, unavailable), Playwright specs for each state and retry, phone-width sweep, plan doc update. Route: delegated.

## Acceptance criteria

See issue #178.

## Checks

- Backend: `pnpm --filter @nuestro-breaking/backend lint`, `test`, `test:e2e`.
- Frontend: `pnpm verify:pr`.

## Progress

- 2026-10-09 — Exploration done; D1 decided by the user.
- 2026-10-09 — T1 done (delegated writer). Deviations: `maskedEmail` is `null` when the participant has no email (manual registrations); `firstName` falls back to the first word of `full_name`; competitions ordered by start time, then name. Checks: backend lint passed; unit 21 suites / 284 tests passed; e2e 25 suites / 238 tests passed; parent spot check `jest src/payments/status` 18/18 passed. Review fixes: `7e3c5fb`, `c544d49` (newest-attempt rule, D4 amended; D8 decided by the user). T1 commits: `df8e75c`, `4a66190`, `7e3c5fb`, `c544d49`; RDD high risk, all three reviews approved and acknowledged. Next: T2 and T3.
- 2026-10-09 — T2 and T3 done (delegated writer, branch `feat/178-02-result-screens`). Writer-chosen copy: taking-longer view ("Tu pago está tardando más de lo normal", asks not to pay again yet) and unavailable view ("No podemos mostrar este pago"); a 400 shows the same neutral view as a 404; a retry that cannot be retried (sales closed, not payable) turns the button into "Volver al inicio". Checks: frontend Vitest 27 files / 236 tests passed; Playwright return and phone-width specs 26 passed; `pnpm verify:pr` exit 0 (Vitest 236, Playwright 276). Parent spot check: Vitest 236/236 passed. Next: RDD per commit, then publish the chain.
- 2026-10-09 — Pending copy reworded (user request): the `CONT` test cardholder gives a card payment in process, not a voucher, so screen 7b now reads "Tu pago está en proceso" and covers both a voucher to pay and a card Mercado Pago is reviewing. Mercado Pago's test-card docs confirm `CONT` simulates a pending payment; the exact API status (`pending` or `in_process`) was not observed, and both map to `pending`. Checks: Playwright return and phone-width specs 26 passed.
