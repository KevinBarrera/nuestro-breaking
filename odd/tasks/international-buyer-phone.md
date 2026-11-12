# International buyer phone

Objective: let a public buyer enter a phone number from another country on Tus datos, as the in-person sale already allows (#390, MVP tracking #57).
Branch: `feat/390-01-international-buyer-phone` → `dev`. Delivery: one PR.
Test runners: frontend Vitest and Playwright (`pnpm --filter @nuestro-breaking/frontend test`, `test:e2e`). Use Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).

## Specs

Quoted from the acceptance criteria of #390.

- **S1** "On Tus datos, the buyer can choose "México +52" or "Otro país" for the phone; "México +52" is the default."
- **S2** ""México +52" keeps today's rule: 10 digits, sent as `+52 <digits>`."
- **S3** ""Otro país" accepts an optional leading `+` and 10 to 15 digits, sent as `+<digits>`, with its own Spanish error message."
- **S4** "The selected mode survives going to revisar and back, and a page reload (draft)."
- **S5** "An existing draft without a mode opens with "México +52" and its phone intact."
- **S6** "Revisa y paga shows the phone with the right country code for each mode."
- **S7** "The admin in-person sale behaves exactly as before after the rules move to `entities/participant`."
- **S8** "The switch meets the frontend accessibility rules (44px targets, labelled group, 4.5:1 contrast in both themes)."
- **S9** "Vitest unit tests cover both modes in `buyer-form` (validation, payload, `displayPhone`) and the draft read/write with and without a mode."
- **S10** "A Playwright flow in `apps/frontend/e2e` completes a purchase with an international phone and checks the request body."
- **S11** "`docs/frontend-architecture.md` describes the phone switch on Tus datos and the shared phone modes in `entities/participant`."

## Tasks

| ID  | Specs  | Task                                                                                                                      | Route  | Status |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| T1  | S7     | Move the phone modes and rules to `entities/participant/model/phone-mode.ts`; the admin sale keeps its copy.              | inline | done   |
| T2  | S1–S6  | `phoneMode` on `BuyerForm` and the draft, mode-aware validation, payload and `displayPhone`, and the switch on Tus datos. | inline | done   |
| T3  | S8–S11 | Vitest and Playwright coverage, and the frontend architecture doc.                                                        | inline | done   |

## Log

- **L1** (2026-11-10) "me parece que un comprador al ingresa sus datos no se le permite cambiar la lada del numero, en registro si es posible. Revisa, dime que encuentras, el comportamiento esperado es que sea posible cambiar la lada"
- **L2** (2026-11-10) Issue #390 created. Then: "Va ahora si implementa el issue".
- **L3** RED: 5 new Vitest cases failed before the change (default mode, international validation and payload, review phone, draft round-trip). GREEN after T1–T2.
- **L4** The mode lives on `BuyerForm` (`phoneMode`), so the draft, the review and the request read it without new context fields. `participantPayload` copies only participant fields, so `phoneMode` never reaches the request body.
- **L5** `admin-registrations.spec.ts` "lists the roster, filters by status, searches live and opens one" is flaky on `dev` without this change (2 of 5 runs failed), so it is a known failure unrelated to this work.
- **L6** (2026-11-10) "sí, corrige los dos puntos en esta rama": (1) server `fieldErrors` for an invalid `buyer.phone` now use the message of the buyer's phone mode (`serverErrors` and `payFailure` take `phoneMode`); RED 2 Vitest cases, then GREEN. (2) Per the design system, the switch uses `nb-chip-selected-*` with `CheckIcon` instead of the admin-only `nb-nav-active-*`.
