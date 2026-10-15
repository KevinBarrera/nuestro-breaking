# Per-pass online sales close — issue #240

Objective: an administrator sets an optional online sales close date and time on each pass; after it, the pass cannot be bought online, while manual and cash registrations keep working.
Branch: chained `feat/240-NN-*` from `dev` at `e3b214f`: `feat/240-01-pass-sales-close-backend` (T1, T2), `feat/240-02` (T3), `feat/240-03` (T4). Delivery: stacked PRs to `dev` (same strategy as #239), `Closes #240` on the last PR, no `Co-Authored-By`.
Test runner: backend Jest unit (`pnpm --filter @nuestro-breaking/backend test`) and PostgreSQL e2e (`test:e2e`, needs Docker); frontend Vitest (`test`) and Playwright (`test:e2e`). Engram mirror: `odd/pass-sales-close/tasks`.

## Specs

- S1 — Issue: "An optional sales close date and time per pass, edited in the admin panel next to the pass price. Empty means the pass follows the event's sales window." Acceptance: "An administrator can set, change and clear a pass's sales close time."
- S2 — Issue: "A pass is on sale online only while the event's window is open and the pass's own close time has not passed."
- S3 — Issue: "The public catalog shows a closed pass as no longer available (or hides it; decide in design)". Decision (2026-10-15): show it, disabled, with the Spanish label "Venta en línea cerrada", because the acceptance says "the buyer sees it is no longer available." Acceptance: "After that time the pass cannot be bought online, and the buyer sees it is no longer available."
- S4 — Issue: "the purchase API rejects it with a clear error, including a buyer who loaded the page before the close time." Acceptance: "A purchase submitted after the close time is rejected, even if the page was loaded earlier."
- S5 — Issue: "Times are entered and shown in the event's local time (America/Mexico_City)."
- S6 — Out of scope: "Manual and cash registrations at the venue: a pass's online close does not block door sales." Acceptance: "Manual registrations of that pass still work." Also out of scope: "A per-pass sales opening date." and "Automatic close dates derived from the activities' schedule."
- S7 — Acceptance: "Backend unit and e2e tests cover the close rule; a Playwright flow covers the public and admin screens."
- Assumption: the close time is exclusive, like the event window (`time >= closesAt` is closed).
- Assumption: checkout of a pending registration created before the close time is not blocked; the rule applies when the purchase is submitted (registration).

## Tasks

| ID  | Specs          | Route  | Status  | Evidence             |
| --- | -------------- | ------ | ------- | -------------------- |
| T1  | S1, S5, S7     | inline | done    | `48b578b`, `a431500` |
| T2  | S2, S3, S4, S6 | inline | done    | `c04e52a`            |
| T3  | S1, S5, S7     | inline | done    | `f19f452`            |
| T4  | S3, S4, S7     | inline | pending |                      |

- T1 — Migration `0028` adds nullable `online_sales_closes_at` to `event_pass_types`; the admin pass-type API reads, creates, updates and clears it (offset ISO or null), and the audit snapshot carries it; `docs/contracts/event-catalog.md`.
- T2 — Public catalog exposes each pass's close time and whether it is on sale; public registration rejects a closed pass with 409 `pass_type_sales_closed`; admin manual and entitlement paths untouched; public catalog and registration contracts.
- T3 — Admin pass form field (`datetime-local` in the event time zone, clearable), list and review diff; Vitest and Playwright.
- T4 — Public passes page shows a closed pass disabled with "Venta en línea cerrada"; a 409 `pass_type_sales_closed` on submit shows a clear message; Vitest and Playwright.

Route evidence: no Writer trigger (units are sequential and share contracts), so the parent writes inline. Forecast about 700 authored changed lines, so the work ships as stacked PRs.

## Log

- L1 (2026-10-15) — User: "de los issues abiertos que tenemos y no tienen relación/dependencia con infra o con el organizador de los más pesados, cuál recomiendas que arranquemos? recuerdo que sugeriste el #240" → "Adelante con #240".
- L2 — Map: the public pass rule check is `passRuleViolation` (`public-registration-rules.ts`), used only by `PublicRegistrationService.register`; manual registration and entitlements have their own checks. Migrations are hand-written (`0027_checkout_service_charge` is the latest on `dev`). Frontend time-zone helpers: `entities/event-catalog/model/zoned-time.ts`.
- L3 — T1/T2: RED observed (admin e2e 5 failed; unit 2 failed), then GREEN: backend unit 588/588, full backend e2e 429/429 after counting migration `0028` in the replay check (`a431500`). Review assessment: medium, `under_budget`.
- L4 — T3: the pass screens now read the event foundation for the time zone, so the admin Playwright mocks gained `mockEventTimeZone` (`e2e/support/event-mocks.ts`). `DateField` moved out of `sales-section.tsx` and now wraps "Quitar" under the input at phone width.
- L5 — T4: a pass is closed on the public screens when `onSale` is false or, on the buyer's clock, its `onlineSalesClosesAt` has passed since the page loaded. `chosenPasses` ignores closed passes, and options, totals and competitions derive from the normalized selection. Vitest RED observed (5 failed), then GREEN 394/394; `verify:pr` 399 passed. The new Playwright cases were written after the code.
