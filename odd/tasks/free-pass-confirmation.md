# Free-pass confirmation

## Tracking

- GitHub issue: #263 — Confirm a registration that holds only free passes
- Chained PRs, merged bottom-up into `dev` (base `073f43b`):
  1. `feat/263-01-cash-confirmation-email`
  2. `feat/263-02-complimentary-confirmation-api`
  3. `feat/263-03-hide-free-passes-online`
  4. `feat/263-04-complimentary-confirmation-ui`
- Follows: #105 in-person sale UI, #179 confirmation emails, #125 cash receipt.

## Goal

An event administrator confirms, at the venue, a `pending_payment` registration whose passes total $0 (golden tickets and guests). The confirmation needs a required reason, assigns the folio, is audited, and sends the confirmation email. Free passes cannot be obtained online. Cash confirmations also send the confirmation email.

## Decisions (product owner, 2026-10-19)

- **Who:** any event administrator, the same as cash.
- **Evidence:** a required free-text reason, stored in the registration operation audit.
- **Email:** both in-person confirmations (without payment and cash) send the confirmation email with the folio. This changes the cash row of `docs/contracts/confirmation-email.md`, which says "No" today.
- **Channel:** free passes are granted in person only. They are hidden from the public catalog and rejected by public registration. `online_sales_closes_at` (0028) is not reused, because a closed pass stays listed online.

## Technical decisions

- A new route, `POST /admin/events/:eventId/registrations/:registrationId/complimentary-confirmation` with `{ reason }`, instead of extending cash confirmation. Cash keeps its positive amount, its receipt and its unique index.
- The server checks that the total of the registration's price snapshots (`event_registration_passes.price_cents`) is 0, so the route cannot skip a payment. A registration with no passes is rejected.
- A new audit operation `complimentary_confirmation` (`amount_cents` NULL, reason in `note`), and a new confirmation source `admin_complimentary`. Both need a hand-written migration that re-creates the check constraints (`0006`, `0016`, `0024`).
- Email: enqueue in the confirmation transaction and dispatch after commit, the same as the webhook. `EventsModule` must import `NotificationsModule`.
- Gotchas: the Drizzle snapshots stop at 0002, so later migrations are hand-written SQL plus a journal entry. `registration_operation_audit` rejects UPDATE.

## Tasks

- [x] 1. Cash confirmation queues and dispatches the confirmation email; backend e2e; update the confirmation-email contract. (PR 1) (RED 4 failed in the dispatch suite, then GREEN 21/21; backend unit 596; e2e: dispatch, manual registration and webhook, 80 passed; lint and Prettier pass. A webhook approval after cash sends no second email: `payment-decision.ts:71-73`, plus `onConflictDoNothing` in the outbox.)
- [x] 2. Migration for the `complimentary_confirmation` audit operation and the `admin_complimentary` source; schema and types. (PR 2) (`0030_complimentary_confirmation.sql` re-creates both checks with every existing value. RED: the new database test hit the operation-type check; GREEN 7/7. The 0016 amount check stays valid with a NULL amount, and the 0029 receipt index does not apply.)
- [x] 3. Complimentary confirmation route and service: required reason, $0 snapshot total, folio, audit, email; backend e2e; update the operations and audit-policy contracts. (PR 2) The after-commit send is now copied in the webhook and in cash; extract one shared helper in notifications instead of adding a third copy. (Done: `notifications/dispatch-after-commit.ts`. RED: 6 new tests got 404; GREEN: 86/86 across the manual registration, dispatch and webhook suites; full backend e2e 447 passed; unit 596; lint and build pass. 409 codes: `no_passes` and `not_zero_total`, computed from the price snapshots under `FOR UPDATE`. The reason is trimmed, 1–500 characters, stored in `note`.)
- [x] 4. Hide $0 pass types from the public catalog and reject them in public registration; unit and e2e tests; update the public contracts. (PR 3) (RED: 2 unit and 2 e2e failing; GREEN: unit 598, e2e catalog, registration, admin catalog and checkout 65/65; lint and build pass. It reuses `pass_type_unavailable`, so a hidden pass looks like a missing one online. The filter lives in the pure projection. The frontend needed no change: `normalizeSelection` already drops unknown pass ids from a saved draft.)
- [x] 5. Frontend entity: `confirmComplimentary` API, reader and typed failures, with Vitest. (PR 4) (RED 5/42, then GREEN 42/42. `readCashConfirmation` was renamed to `readConfirmation` because it reads both answers.)
- [ ] 6. Sale screen: "Confirmar sin cobro" with a required "Motivo", a confirmation dialog, the ref guard and lost-answer handling, replacing the $0 notice; Vitest and Playwright. (PR 4)
- [ ] 7. Docs: the event-day runbook "Venta en el lugar" and the frontend architecture. (PR 4)

## Evidence

- Exploration on 2026-10-19: cash stores amount, receipt and note only in `registration_operation_audit`; the folio comes from `confirm-registration.ts`; `enqueueConfirmationEmail` is called only from `payment-webhook.service.ts:376`; the email policy does not depend on payment kind or amount.
