# Buyer activity kinds

Objective: the payment result screen and the confirmation email list each pass's included and selected activities grouped by kind (#404). Branches `fix/404-01-backend-activity-kinds` → `dev` and `fix/404-02-result-activity-kinds` → slice 1, one commit per task. Runners: Jest unit and e2e (backend), Vitest and Playwright (frontend).

## Specs

- **S1 Reader.** "Backend: `readRegistrationPasses` returns, for each pass, its included activities and its selected activities together, each with its `kind`." Decided (L3): included activities are only `active` ones; an activity both included and selected is listed once.
- **S2 Payment status API.** "Payment status API: replace `passes[].competitions` with a list of activities that carries the kind (for example `activities: [{ name, kind }]`). Update `docs/contracts/public-payment-status.md`."
- **S3 Grouping.** "Payment result screen and confirmation email (text and HTML): list each pass's activities grouped by kind, one line per kind, without separating included from chosen:" `Pase completo Breaking` / `Categorías: Breaking 1vs1` / `Talleres: Workshop intensivo de footwork`. "Lines go in that kind order. Within a line, activities are ordered by start time, then name (the current order)." "A kind with no activities has no line. A pass with no activities shows only its name, as today." Labels decided (L2, L3): `competition` → "Categorías", `workshop` → "Talleres", `social` → "Actividades sociales"; an unknown kind in the frontend → "Actividades", never a rejected response.
- **S4 Email contract.** "Update `docs/contracts/confirmation-email.md` (example at `:66`, passes row at `:79`)."
- **Acceptance.** "Backend unit/e2e: the reader returns included and selected activities with their kind, in the defined order." "Payment status e2e: the response carries included and selected activities with their kind." "Email content spec: the text and HTML versions group activities by kind with the agreed labels, and a workshop is never listed under \"Categorías\"." "Frontend unit tests: the payment status reader accepts the new shape, and the result view groups by kind." "Playwright: the payment result shows an included competition and a chosen workshop on separate lines." "Contracts updated." "Checked on staging with a pass that includes one activity and lets the buyer choose another."
- **Out of scope.** "Separating \"incluidas\" from \"elegidas\" on buyer-facing surfaces." Admin detail labels (#405). Pre-payment step wording. Snapshotting included activities at purchase time.

## Tasks

| ID  | Specs          | Route  | Status  | Commit |
| --- | -------------- | ------ | ------- | ------ |
| T1  | S1, S2, S3, S4 | inline | pending |        |
| T2  | S2, S3         | inline | pending |        |
| T3  | Acceptance     | user   | pending |        |

T1: backend reader, payment status API, email text and HTML, both contracts (slice 1). T2: frontend payment status reader, result view, Playwright, `docs/frontend-architecture.md` (slice 2). T3: staging check after both merge. Route evidence: each slice is one dependent behavior, no writer trigger.

## Log

- L1 (2026-11-26, user): "Necesito tu ayuda para revisar el issue https://github.com/KevinBarrera/nuestro-breaking/issues/404 - tenemos todo listo para trabajar en él? si te fijas en las últimas 6 PRs que se mergearon a dev podrás ver algo de contexto, pero este ticket es enfocado al email que reciben los compradores"
- L2 (2026-11-26, user): "usemos \"Actividades sociales\""
- L3 (2026-11-26, user choices): "Solo activas, sin duplicados (Recomendado)"; "Agruparlo en \"Actividades\" (Recomendado)"; "Comentar en #404 y arrancar la PR 1". Decisions posted on #404 (issuecomment-7205857876).
- L4 (2026-11-26): T1. RED: the email content spec failed 16/16 (new `activities` shape) and 3 e2e tests failed (payment status by kind, included+selected once, email "Talleres: Workshop de footwork"). GREEN: backend unit 664/664, e2e 557/557, lint and typecheck pass. Included activities follow `registration-entitlements.service.ts` (active only); a selection of an included activity is listed once.
