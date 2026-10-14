# Flagged payments review — issue #230

Objective: a read-only admin screen, **Pagos por revisar**, lists the Mercado Pago payments of one event that the system recorded but could not settle on its own.
Branch: chained `feat/230-NN-*` from `dev` at `ffd0204`. Delivery: `auto-chain`, stacked to `dev`; `Closes #230` on the last PR, no `Co-Authored-By`.
Test runner: backend Jest unit and PostgreSQL e2e (`pnpm --filter @nuestro-breaking/backend test` / `test:e2e`), frontend Vitest and Playwright. Engram mirror: `odd/flagged-payments-review/tasks`.

## Specs

- S1 — Issue scope: "an event-scoped admin read endpoint that lists flagged payments of one event, one row per Mercado Pago payment (latest outcome), newest first: when it arrived, the reason, the amount, the Mercado Pago payment id, and the registration (folio when it has one, participant name, status). Same session, CSRF and event-scope rules as the other admin routes." Flagged reasons: `approved_after_expiry_duplicate`, `approved_after_expiry_event_ended`, `approved_after_confirmation`, `approved_after_void`. Assumption: "latest outcome" is the payment's latest processed outcome of any kind, so a payment that is later refunded or confirmed in Mercado Pago drops off the list. A failed provider read (`payment_not_found`, `payment_unreadable`) is not an outcome and never hides a flagged payment (verifier advisory 1).
- S2 — Issue acceptance: "An admin of the event sees every flagged payment of that event once, with reason, amount, payment id and registration; admins of other events and unauthenticated users cannot."
- S3 — Issue acceptance: "Payments that confirmed a registration normally never appear."
- S4 — Issue acceptance: "No payer data from Mercado Pago is shown or stored (only what the registration already holds)."
- S5 — Issue scope: "an admin page **Pagos por revisar** reachable from the event's side navigation, with each reason in plain Spanish and what coordination should do (for example: "Pagó dos veces: revisa la otra inscripción y reembolsa uno de los pagos en Mercado Pago"). Empty state when there is nothing to review."
- S6 — Issue scope: "the support runbook points to the screen instead of the SQL query; contract doc for the endpoint."
- S7 — Issue acceptance: "PostgreSQL e2e covers each reason, the one-row-per-payment rule and authorization; Playwright covers the page, the empty state and phone width."

## Tasks

| ID  | Specs                  | Route  | Status | Evidence |
| --- | ---------------------- | ------ | ------ | -------- |
| T1  | S1, S2, S3, S4, S6, S7 | inline | done   | see Log  |
| T2  | S5, S6, S7             | inline | done   | see Log  |

- T1 — Backend: `GET /admin/events/:eventId/flagged-payments` in `src/payments/review/`, guarded by `authorizeEventAdmin`; PostgreSQL e2e; contract doc.
- T2 — Frontend: entity API slice, page, side navigation entry, route, Playwright (page, empty state, sweeps); support runbook points to the screen.

Routes: inline (sequential units; no Writer trigger). Risk: T1 item 2 (new admin authorization surface) → independent verifier. T2: none expected.

## Log

- L1 (user, 2026-10-13): "sí, arranquemos con #230"
- 2026-10-13: mapping. `payment_webhook_notifications` holds only notification id, payment id, times and outcome; amount and registration come from `registration_payments` → `registration_checkouts` → `event_registrations` (+ `participants.full_name`). All four flagged outcomes record the payment (`payment-decision.ts:64`). Template endpoint: `event-sales.controller.ts` (`authorizeEventAdmin`, admins only; GETs skip CSRF). Template e2e: `test/admin-event-sales.e2e-spec.ts`. `PaymentsModule` needs `IdentityAccessModule`. No migration needed.
- 2026-10-13: T1 done (`f669dd1` + fix commit). `GET /admin/events/:eventId/flagged-payments` in `src/payments/review/`, `authorizeEventAdmin`, `IdentityAccessModule` added to `PaymentsModule`; contract `docs/contracts/flagged-payments.md`. RED (route 404, 4 failed) then GREEN; backend unit 500/500, e2e 398/398; lint, `tsc`, Prettier clean. Verifier: S1–S4, S6 (contract), S7 (backend) met, no blockers. Fixed advisory 1 (a later `payment_unreadable`/`payment_not_found` hid a flagged payment) with a RED test first. Accepted: A2 (`now()` is the transaction start, so two racing writers for one payment could order `processed_at` backwards; the window is tiny and the writers are outside #230), A3 (no `reconciliation:` id in the e2e; the query ignores notification ids), A4 (ties undefined, not realistic). The hook's base-diff candidate since #168 (235 commits) was declined per the review-consent rule.
- 2026-10-13: T1 review (lenses risk + reliability, lineage `review-ab00903f5deea630`) approved and acknowledged. Suggestions only: tie order (accepted as A4) and no test for a non-UUID event id (400 from `ParseUUIDPipe`, same as other admin routes).
- 2026-10-13: T2 done. `entities/flagged-payments` (client + runtime reader), page `admin-payments-review-page.tsx` with `payments-review-model.ts` (Spanish title, detail and action per reason; status labels; arrival time in the browser zone), route `/admin/events/:eventId/payments-review`, side navigation entry under OPERACIÓN. Playwright `admin-payments-review.spec.ts` (list reached from the side navigation, empty state, safe failure copy, 375px) and the screen joins the shared accessibility, phone-width and native-select sweeps (`adminScreens`, placed after Datos del evento because other specs address entries by index). Docs: support runbook points to the screen instead of the SQL, contract Admin UI section, frontend architecture. Evidence: RED (Vitest modules missing; Playwright 4 failed) then GREEN; first `verify:pr` failed 4 sweep specs that use `adminScreens[2]`/`[3]` (fixed by the placement); final `verify:pr` exit 0: Vitest 369/369, Playwright 389/389.
