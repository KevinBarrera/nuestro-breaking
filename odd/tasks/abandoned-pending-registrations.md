# Abandoned pending online registrations — issue #181

Objective: online `pending_payment` registrations that are never paid expire, are voided with a system audit fact and stop blocking a new purchase; a late Mercado Pago approval follows an explicit rule.
Branch: chained `feat/181-NN-*` from `dev` at `d769205`. Delivery: `auto-chain`, stacked to `dev`, published at the end like #177/#213; `Closes #181` on the last PR, no `Co-Authored-By`.
Test runner: backend Jest unit (`pnpm --filter @nuestro-breaking/backend test`) and PostgreSQL e2e (`test:e2e`, needs Docker). Engram mirror: `odd/abandoned-pending-registrations/tasks`.

## Specs

- S1 — Issue acceptance: "The expiry duration is documented and configurable." The same window is sent to Mercado Pago as the preference `date_of_expiration`, so the offline payment voucher (OXXO/SPEI) stops being payable before our registration expires (user, L3). Mercado Pago recommends at least 3 days for offline payments and returns money paid after `date_of_expiration` to the payer's account ([docs](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-settings/expiration-date)).
- S2 — Issue acceptance: "An expired pending registration is voided and audited, and no longer counts as a duplicate." Audited with the system actor. Only online pending registrations expire; admin manual pending registrations (cash) are not touched (#104 owns their void).
- S3 — Issue scope: "Retry by the same buyer before expiry reuses the pending registration." After expiry, a retry creates a new pending registration.
- S4 — Issue acceptance: "A late approval follows the documented rule and never confirms silently into an inconsistent state." Rule chosen by the user (L2): a payment approved after expiry confirms the registration automatically, with a late-payment mark in the audit, when the event has not ended yet and the same person has no other active (pending or confirmed) registration for that event. Otherwise the payment is stored, the registration stays voided and the case is flagged for coordination's manual review. No automatic refund.
- S5 — Issue acceptance: "PostgreSQL e2e specs cover expiry, retry and late approval."
- S6 — Follow-up recorded for #181 in `odd/tasks/mercado-pago-checkout.md` (Log, 2026-10-09): "a claim left unprocessed because Mercado Pago stopped retrying (credential outage, early 404) has no automatic recovery; reconcile pending registrations that have a checkout by reading their payments." Assumption: before an online pending registration with a checkout is expired, its Mercado Pago payments are read once, so an approval Mercado Pago failed to deliver confirms instead of expiring.

## Tasks

| ID  | Specs      | Route  | Status  | Evidence |
| --- | ---------- | ------ | ------- | -------- |
| T1  | S1, S3     | inline | done    | see Log  |
| T2  | S2, S3, S5 | inline | done    | see Log  |
| T3  | S4, S5     | inline | pending | —        |
| T4  | S6, S5     | inline | pending | —        |

- T1 — Payment window: config setting, `expires_at` on online pending registrations (set on create, reuse and checkout), preference `date_of_expiration`, migration `0023`. Docs: purchase contract, Mercado Pago runbook.
- T2 — Expiry: void expired online pending registrations with a `registration_expiry` audit fact (system actor), lazily inside the purchase lock and the checkout, plus an in-process sweeper like the email sweeper. Docs: public registration and audit policy contracts.
- T3 — Late approval rule in the webhook, with e2e for both branches. Docs: payment contract, support runbook (how coordination finds flagged cases).
- T4 — Reconciliation: read a registration's payments before expiring it.

Routes: all inline (no Writer trigger: sequential units sharing the registration and payment modules). Risk: item 1 (migration and status change of stored rows), item 3 (`voided` stops being terminal for expired rows), item 4 (sweeper vs webhook on the same row) — each task gets an independent verifier per the high-risk rule.

## Log

- L1 (user, 2026-10-13): "arranquemos con #181"
- L2 (user, 2026-10-13, on late approvals): "es que esto me genera duda porque hasta ahora (9 ediciones anuales de Los más pesados) nunca hemos considerado un criterio de "cupo", entonces creo que mientras el pago se haga antes del evento (si Mercado Pago lo permite) no tendría que representar un problema, me explico?" — then accepted the proposal: auto-confirm a late approval when the event has not ended and the person has no other registration; otherwise manual review.
- L3 (user, 2026-10-13): "sí, avanza con esa regla — porque también falta definir el "tiempo permitido/ventana de pago a tiempo" para OXXO/SPEI, si este intervalo de tiempo se puede configurar en conjunto con Mercado Pago entonces creo que este riesgo se puede mitigar"
- 2026-10-13: mapping. No expiry, void command, origin column or injected clock exists. `reusablePending` (`public-registration.service.ts:235`) ignores voided rows; the webhook already records `approved_after_void` without confirming (`payment-decision.ts:66`); the audit `operation_type` check needs a migration for a new type; the email sweeper is the in-process job pattern; e2e back-dates timestamps in SQL. Final window length depends on the organizer's answers (questionnaire questions 8 and 14, #59).
- 2026-10-13: T1 done. `PENDING_PAYMENT_HOURS` (default 72, 1–720) in `src/events/shared/pending-payment-window.ts`, provided by both the events and payments modules; `expires_at` = payment window + 24 h, set on online create and reuse and on each checkout; preference `date_of_expiration` sent with a `+00:00` offset; hand-written migration 0023 with a backfill (repo has no drizzle snapshots after 0002, so `db:generate` output was discarded). Verifier: S1 and S3 met, no blockers. Its advisory 1 (an online buyer reusing an admin manual pending registration gave it an expiry, contradicting S2) was fixed: only rows that already have an expiry get a new one, and the backfill skips rows with a `manual_registration` fact. Evidence: RED (unit: module missing, preference 1 failed; e2e 3 failed, then 2 failed for the manual case) then GREEN; backend unit 481/481, e2e 372/372; lint, `tsc --noEmit` and Prettier clean. Accepted advisories: `expires_at` may fall after the event (handled in T2/T3); the backfill runs on an empty e2e database, so only its syntax is exercised.
- 2026-10-13: T1 review (lenses risk + reliability, lineage `review-31cd27f53240f0d6`) approved and acknowledged. Advisories: backfill untested; a manual registration paid online still sends `date_of_expiration` (accepted: cash stays possible); reuse of an expired-but-not-voided row extended its window (fixed by T2, which voids before matching).
- 2026-10-13: T2 done. `expireDueRegistrations` (`src/events/registration-expiry/`) voids due online pending rows under row locks with a `registration_expiry` fact (system actor, migration 0024); called inside the purchase's per-event lock before duplicate matching, before the checkout's status read, and by `PendingRegistrationExpirySweeper` (`PENDING_EXPIRY_SWEEP_INTERVAL_MS`, default 300000, `0` off, forced off in e2e; per-event lock + `SKIP LOCKED`, 20 events × 100 rows per tick). Verifier: S2, S3, S5 met, no blockers. Fixed from its advisories: A2 (checkout now re-locks the row after the provider call and answers 409 with no checkout row when it was voided meanwhile) and A4 (the purchase expires every due row of the event, no limit). Accepted: A3 (a purchase racing a checkout at the expiry boundary can answer 409 once; a retry succeeds), A5 (wider lock set on purchase; PostgreSQL detects the rare pass-type deadlock), A6 (approval on an expired-but-not-voided row confirms: T3/T4). Follow-up, not #181: A1, admin manual registration counts voided rows as duplicates (`manual-registration.service.ts:34-45`), so a person whose online registration expired cannot be registered in cash; pre-existing, belongs with #104. Evidence: RED (unit module missing; e2e 1 failed, then 2 failed for A2/A4) then GREEN; backend unit 490/490, e2e 377/377; lint, `tsc --noEmit`, Prettier clean.
- Next: T3.
