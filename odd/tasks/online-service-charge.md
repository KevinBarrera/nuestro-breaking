# Online service charge — issue #239

Objective: online buyers pay the Mercado Pago fee as a separate "Cargo por servicio", so the organizer receives the full pass price; cash and manual registrations keep the pass price.
Branch: chained `feat/239-NN-*` from `dev` at `a7d7575`: `feat/239-01-service-charge-backend` (T1, T2), `feat/239-02` (T3), `feat/239-03` (T4, T5). Delivery: stacked PRs to `dev`, `Closes #239` on the last PR, no `Co-Authored-By`.
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

| ID  | Specs      | Route  | Status                                 | Evidence  |
| --- | ---------- | ------ | -------------------------------------- | --------- |
| T1  | S1, S2, S7 | inline | done                                   | `9059890` |
| T2  | S4, S6     | inline | done                                   | `33c7508` |
| T3  | S3, S7     | inline | done                                   | `88b8d64` |
| T4  | S5         | inline | done                                   | `4dc8cd0` |
| T5  | S8, docs   | inline | done: docs; S8 handed to the organizer | `eb8c20d` |

- T1 — Backend charge config reader (env, fail fast when missing) and an integer-math gross-up calculator with unit tests; `.env.example` and env docs.
- T2 — Checkout adds the charge as its own Mercado Pago item and stores it on `registration_checkouts` (migration `0027`); webhook, reconciliation and payment status use the charged total; manual path untouched.
- T3 — Public catalog exposes the charge settings; the frontend mirrors the calculator (same test vectors), shows "Cargo por servicio" on the review screen and the paid total on the result screen; e2e updated.
- T4 — Confirmation email shows the charge for online purchases; contract and spec updated.
- T5 — Docs: purchase plan, contracts, runbooks; refundability text once the organizer answers.

## Log

- L1 (2026-10-15, user): "sí, arranquemos con #239"
- 2026-10-15 (user): "Adelante con variables de entorno" — the charge is configured per environment, not per event.
- 2026-10-15: Mapping. Money is integer cents end to end (`centsToPesos`, `checkout-preference.ts:15`). The webhook expects the sum of `event_registration_passes.price_cents` (`payment-webhook.service.ts:295`, `payment-decision.ts:66`), so it must add the charge or `amount_mismatch` flags every paid order. The review screen computes its total in the browser from the catalog (`purchaseTotals`, `purchase-selection.ts:168`). Migrations are hand-written in `apps/backend/drizzle/` with `meta/_journal.json` (latest `0026`). No central env schema; readers per module (`readMercadoPagoConfig`).
- 2026-10-15 (user): "vamos con esos 3 PRs" — three chained PRs to `dev`.
- 2026-10-15: T1 done (`9059890`). `readServiceCharge` in `events/shared/service-charge.ts` reads `ONLINE_SERVICE_CHARGE_PERCENT`, `ONLINE_SERVICE_CHARGE_FIXED_MXN` and `ONLINE_SERVICE_CHARGE_VAT_PERCENT` (all required, at most two decimals, stored as hundredths); `serviceChargeCents` grosses up with BigInt math. RED observed (module missing), GREEN 23 tests, including an exact check that the organizer keeps at least the price and one cent less would not. The e2e env forces 3.49 / 4.00 / 16.
- 2026-10-15: T2. The checkout adds a last "Cargo por servicio" item and stores `service_charge_cents` on `registration_checkouts` (migration `0027`, default 0, check `0 <= charge < amount_cents`); `amount_cents` is passes plus charge. The webhook expects the pass sum plus the latest checkout's charge; payment status returns `serviceChargeCents` and a `totalCents` that includes it. Unit RED observed for the preference item; the e2e tests were written first but run only after the implementation. Checks: backend lint clean, unit 584/584, e2e 424/424 (the migration count in `event-activity-foundation.e2e-spec.ts` went from 27 to 28).
- 2026-10-15: Review assessment of `a7d7575..7f22a03`: high (payments schema, webhook), review due. Consent granted per the standing rule; lenses risk and reliability. Approved and acknowledged (lineage `review-d2ced962c8b2a83f`), with no findings from the risk lens. Non-blocking reliability advisories: (1) the webhook expects the latest checkout's charge, so if the rates change between two checkouts and the buyer pays the older voucher, the payment is flagged `amount_mismatch` for manual review; (2) the payment status total uses the latest checkout's charge, which can differ from what was paid in that same case; (3) the rollout order of the new required variables. (3) was added to `docs/runbooks/deploy.md`. (1) and (2) are left as follow-ups because rates rarely change inside a 72-hour window, and flagged payments already have a manual path.
- 2026-10-15 (user): "sigue con T3, abriremos las PRs al último cuando cubramos el desarrollo de todo el issue" — the PRs are opened only after T5.
- 2026-10-15: T3 on `feat/239-02-service-charge-frontend` (`88b8d64`). `GET /public/events/:slug/catalog` adds `serviceCharge` (`rateBasisPoints`, `fixedCents`, `vatBasisPoints`; the controller adds it, so `PublicCatalogService` is unchanged); `EventsModule` also provides `SERVICE_CHARGE`. The frontend mirrors the calculator (`entities/public-event/api/service-charge.ts`, same test vectors as the backend), validates the rates and `serviceChargeCents` in the readers, and the review screen shows "Cargo por servicio" / "Comisión de Mercado Pago" above the total; the pay button and total include it. The result screen's "Pagado" already shows the backend total with the charge. RED observed for the catalog e2e, the calculator and the readers. Checks: format clean; frontend lint, build, unit 389/389, e2e 395/395 (one assertion fixed for the sub-label); backend lint, unit 584/584, catalog e2e 6/6.
- 2026-10-15: T3 assessment: medium, `under_budget`; it stays pending in the slice.
- 2026-10-15: T4 on `feat/239-03-service-charge-email` (`4dc8cd0`). The confirmation email adds "Resumen de pago" (Pases, Cargo por servicio, Total pagado … MXN) only when the approved payment's checkout has a charge above 0; cash and manual emails still show no amounts. The dispatcher reads the charge from the checkout behind the latest approved payment. RED observed for the content spec. Checks: backend lint, unit 586/586, email e2e 17/17. Contract `confirmation-email.md` updated.
- 2026-10-15: T5 docs (`eb8c20d`): the purchase plan records the fee decision. S8 stays open: the draft cancellation text (`legal-texts.ts`, version `borrador-2026-10-13`) says "Las compras en línea de este evento no tienen reembolso." and does not mention the charge; legal texts come from the organizer, and a text change bumps the version in both apps.
- 2026-10-15: T3 and T4 assessment: medium, `under_budget` (308 lines since `38aeb2a`); no review due. The stop hook twice offered a base-diff from `c9c9441` (#168 merge, about 465 files); it was declined per the standing rule.
- 2026-10-15: Independent verifier over `a7d7575..HEAD`: S1–S7 PASS, S8 open and not claimed. Backend unit 586/586, frontend unit 389/389, both lints clean, 7 backend e2e suites 112/112. The probes found the backend and frontend calculators identical over 428,574 checks, and the organizer keeps the full price with the smallest total. No blockers. Advisories: the rate-change follow-ups already logged; deploy the backend before the frontend (now in `docs/runbooks/deploy.md`); with zero rates the email shows no summary. Parent spot check: frontend unit 389/389.
- 2026-10-15: S8 research. Per Mercado Pago México's help ("Cómo devuelvo un pago", https://www.mercadopago.com.mx/ayuda/devolver-pago_279, read through search results because the page answered 403), refunding an online payment gives back Mercado Pago's fee, within 90 days; how much fee a partial refund returns is unclear. So a full refund, charge included, costs the organizer nothing.
- 2026-10-15 (user): "Ok, si mercado pago es capaz de eso entonces esta bien" — propose to the organizer, with the final legal texts, the cancellation line "Si el organizador aprueba un reembolso, se devuelve el total pagado, incluido el cargo por servicio." The draft legal text is unchanged in code. The organizer should confirm the fee refund in his Mercado Pago account.
- Next: open the three chained PRs (user decision).
