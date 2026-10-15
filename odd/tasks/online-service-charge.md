# Online service charge — issue #239

Objective: online buyers pay the Mercado Pago fee as a separate "Cargo por servicio", so the organizer receives the full pass price; cash and manual registrations keep the pass price.
Branch: `feat/239-online-service-charge` from `dev` at `a7d7575`. Delivery: forecast ~800 authored lines, over the 400-line budget; chain strategy pending the user's answer. No `Co-Authored-By`.
Test runner: backend Jest unit (`pnpm --filter @nuestro-breaking/backend test`) and PostgreSQL e2e (`test:e2e`, needs Docker); frontend Vitest (`test`) and Playwright (`test:e2e`). Engram mirror: `odd/online-service-charge/tasks`.

## Specs

- S1 — Issue: "Configure the charge as a percentage plus a fixed amount, both before VAT". User decision (2026-10-15): environment variables, not an event setting. Rates come from the organizer's Mercado Pago account ("do not hardcode them"); development uses placeholder rates.
- S2 — Issue: "Gross the amount up so the organizer receives the full pass price: `total = (price + fixed × (1 + VAT)) / (1 − rate × (1 + VAT))`, rounded up to the cent." One charge per online purchase, for every payment method ("Checkout Pro fixes the amount before the buyer chooses card, OXXO or SPEI").
- S3 — Issue: "Show the charge as its own line ("Cargo por servicio") on the review screen, next to the pass price and the total, before the legal acceptance." Acceptance: "An online purchase shows the pass price, the service charge and the total before paying."
- S4 — Issue: "Send it to Mercado Pago as part of the order total, store it on the registration for reconciliation". Acceptance: "The amount charged by Mercado Pago equals that total, and the registration stores the charge separately." The webhook and reconciliation must confirm a payment of that total (today they expect only the pass sum, `payment-webhook.service.ts:295`).
- S5 — Issue: "show it in the confirmation email". Acceptance: "The confirmation email shows the charge." This reverses the "Never included" amounts rule in `docs/contracts/confirmation-email.md`.
- S6 — Acceptance: "Manual cash registrations are unchanged." Out of scope: "Changing prices or charges for cash or manual registrations", "A different charge per payment method", "Invoicing".
- S7 — Acceptance: "Unit tests cover the gross-up and rounding; the purchase e2e flow covers the review line."
- S8 — Issue: "State whether the charge is refundable in the cancellation policy (#180 texts)." Open: needs the organizer's answer.
- Assumption: the payment result screen total includes the charge, so it matches what the buyer paid.

## Tasks

| ID  | Specs      | Route  | Status  | Evidence |
| --- | ---------- | ------ | ------- | -------- |
| T1  | S1, S2, S7 | inline | pending |          |
| T2  | S4, S6     | inline | pending |          |
| T3  | S3, S7     | inline | pending |          |
| T4  | S5         | inline | pending |          |
| T5  | S8, docs   | inline | pending |          |

- T1 — Backend charge config reader (env, fail fast when missing) and an integer-math gross-up calculator with unit tests; `.env.example` and env docs.
- T2 — Checkout adds the charge as its own Mercado Pago item and stores it on `registration_checkouts` (migration `0027`); webhook, reconciliation and payment status use the charged total; manual path untouched.
- T3 — Public catalog exposes the charge settings; the frontend mirrors the calculator (same test vectors), shows "Cargo por servicio" on the review screen and the paid total on the result screen; e2e updated.
- T4 — Confirmation email shows the charge for online purchases; contract and spec updated.
- T5 — Docs: purchase plan, contracts, runbooks; refundability text once the organizer answers.

## Log

- L1 (2026-10-15, user): "sí, arranquemos con #239"
- 2026-10-15 (user): "Adelante con variables de entorno" — the charge is configured per environment, not per event.
- 2026-10-15: Mapping. Money is integer cents end to end (`centsToPesos`, `checkout-preference.ts:15`). The webhook expects the sum of `event_registration_passes.price_cents` (`payment-webhook.service.ts:295`, `payment-decision.ts:66`), so it must add the charge or `amount_mismatch` flags every paid order. The review screen computes its total in the browser from the catalog (`purchaseTotals`, `purchase-selection.ts:168`). Migrations are hand-written in `apps/backend/drizzle/` with `meta/_journal.json` (latest `0026`). No central env schema; readers per module (`readMercadoPagoConfig`).
- Next: the user picks the delivery strategy, then T1.
