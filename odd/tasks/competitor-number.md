# Competitor number

Objective: give every competitor a per-event number shown on check-in, registration detail and every backup list (#377, MVP tracking #57).
Branches: `feat/377-01-competitor-number-backend` → `dev` (base `149ae26`, tasks T1–T4), then `feat/377-02-competitor-number-screens` → `feat/377-01-competitor-number-backend` (tasks T5–T8). Delivery: chained PRs, merged bottom-up.
Test runners: backend Jest unit and PostgreSQL e2e (`pnpm --filter @nuestro-breaking/backend test`, `test:e2e`), frontend Vitest and Playwright (`pnpm --filter @nuestro-breaking/frontend test`, `test:e2e`). Use Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).

## Specs

Quoted from the issue body of #377 (revised 2026-11-06).

- **S1 Data.** "a nullable `competitor_number` integer on `event_registrations`, with `UNIQUE (event_id, competitor_number)` and a positive-value check, plus a migration."
- **S2 Eligibility.** "a registration is a competitor when it is `confirmed` and its pass includes a competition activity, or it has selected a selectable competition. An unselected selectable competition does not count."
- **S3 Assignment on check-in.** "the first event or activity check-in of an eligible registration without a number assigns one, even when that check-in happens at a workshop. A registration that becomes eligible after its first check-in gets a number on its next check-in. Selection changes, discipline swaps and pass type changes do not assign numbers." Scope: "`recordEventFact` assigns the next number to an eligible registration without one, in the same transaction. It takes `pg_advisory_xact_lock(hashtext(eventId))` before reading `MAX`, and only when the registration is eligible and has no number. A repeated check-in keeps the existing number."
- **S4 Next number.** "always `MAX + 1` for the event, starting at 1. A number is never handed to anyone else, so gaps are expected (for example `001`, `003`, `004`). Stored as an integer, shown with leading zeros as `001`, `002`, ... (numbers above 999 show as-is)."
- **S5 Losing eligibility.** "the registration keeps its number."
- **S6 Admin assign or change.** "an admin can give an eligible registration the next number. With no number this assigns one, even before check-in. With a number it retires the old one. Every admin assignment or change is recorded in the registration operation audit." Scope: "an admin endpoint gives an eligible, confirmed registration the next number, through the same assignment function as check-in. It rejects ineligible or unconfirmed registrations. It adds a new audit operation kind (a migration for the CHECK constraint) that records the previous number (or none) and the new one, and the registration history projection shows it." Comment 2026-11-06: "Assignment on check-in is not audited, because the check-in fact already records it."
- **S7 Where it appears.** "the check-in screen, the registration detail in the admin and the backup lists. It does not appear in the confirmation email or the public payment status page."
- **S8 Attendee lists API and order.** "each row includes `competitorNumber` (or `null`)". "rows with a number come first in ascending order, then rows without one in alphabetical order."
- **S9 Search.** "a query of digits only also matches the number by numeric equality. `7` and `007` find only `007`, not `017` or `070`." "The check-in screen search gets the same behavior through `matchesQuery`."
- **S10 Check-in screen.** "shows the number assigned on check-in ("Número 007") and the current number of a competitor, with the action "Asignar número" when there is none and "Cambiar número" when there is one. The action is confirmed with `ConfirmDialog`."
- **S11 Registration detail.** "shows the number formatted as `001` when the registration has one."
- **S12 Backup lists screen and PDF.** "every list (event, pass, competition and workshop) shows a "Número" column formatted as `001`, right after the "✓" column. On the printout the column must fit a letter sheet in portrait without squeezing "Nombre" and "AKA" into unreadable widths, including the event list that also shows "Pases". The search "Buscar en esta lista: nombre, AKA, folio o número" also matches the number as in decision 9."
- **S13 UI.** "The number is set in the `data` text style (IBM Plex Mono), like folios. Buttons start with the verb and switch to the gerund while the action runs ("Asignando…", "Cambiando…"). Errors say how to fix the problem in one sentence, with no codes. The number column prints black on white under `@media print`." Plus "`--nb-*` tokens in both themes, 44px touch targets, 4.5:1 contrast, no horizontal scroll at phone width."
- **S14 Docs.** "update the check-in, registration detail, registration operation audit and attendee lists contracts and the related product doc."
- **Out of scope.** "Swapping numbers between registrations." "Choosing a specific number by hand. An admin change always gives the next number." "Assigning numbers in the selection change, discipline swap or pass type change flows." "Showing the number in the confirmation email or the public payment status page."

### API contract (parent decision, shared by both slices)

- Attendee lists rows (`GET /admin/events/:eventId/attendee-lists`, also read by the check-in screen): `competitorNumber: number | null`.
- Registration detail (`GET /admin/events/:eventId/registrations/:registrationId/entitlements`): `competitorNumber: number | null` at the top level of the response.
- Check-in responses (`POST …/check-in` and `POST …/activities/:activityId/check-in`): add `competitorNumber: number | null`, the number after the check-in.
- Admin action: `POST /admin/events/:eventId/registrations/:registrationId/competitor-number` (no body, same CSRF and admin guard as the other registration operations). `201` returns `{ registrationId, competitorNumber, previousCompetitorNumber }` (`previousCompetitorNumber` is `null` on a first assignment). Unknown registration: `404`. Not confirmed: `409` with `code: 'competitor_number_not_confirmed'`. Not eligible: `409` with `code: 'competitor_number_not_eligible'`.
- Audit operation kind: `competitor_number_assignment`, with the previous and new number in the audit payload, shown in the registration history feed.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | S1–S5 | Migration, schema, eligibility, shared assignment function with the per-event lock, assignment in `recordEventFact`, `competitorNumber` in check-in responses. Unit + PostgreSQL e2e. Risk items 1 and 4. | delegated (backend writer) | pending | |
| T2 | S6 | Admin endpoint, audit kind migration, history projection. Unit + e2e. | delegated (backend writer) | pending | |
| T3 | S8, S11 | `competitorNumber` in attendee lists (with the new order) and registration detail. e2e. | delegated (backend writer) | pending | |
| T4 | S14 | Backend contracts: check-in, registration detail/operations, audit policy, attendee lists Response. | delegated (backend writer) | pending | |
| T5 | S4, S9 | Frontend model: `001` formatting and number search in `matchesQuery`. Vitest. | delegated (frontend writer) | pending | |
| T6 | S10, S13 | Check-in screen: number display, "Asignar número" / "Cambiar número" with `ConfirmDialog`. Playwright. | delegated (frontend writer) | pending | |
| T7 | S11, S13 | Registration detail number. Playwright. | delegated (frontend writer) | pending | |
| T8 | S12, S13, S14 | Lists screen and printout "Número" column, order, search copy; product doc and the Admin UI part of the contracts. Playwright. | delegated (frontend writer) | pending | |

Route evidence: Writer trigger (a). Backend (`apps/backend`, backend contract sections) and frontend (`apps/frontend`, product doc) are two independent units with disjoint edit surfaces, each several hundred lines, launched together; the frontend runs against mocked APIs using the contract above. Shared doc sections with both a backend and a UI part (`docs/contracts/attendee-lists.md` "Admin UI", `docs/contracts/operational-check-in.md` screen section) are edited by the parent at the end from the frontend writer's report. Verification trigger: T1 names risk items 1 (migration) and 4 (concurrency), so an independent verifier runs at the end of slice 01.

## Log

- **L1 (2026-11-06, user):** "empieza la implementación del issue #377"
- **L2 (2026-11-06):** the issue body was revised the same day with the agreed decisions (comments on #377). The API contract above is a parent decision, not quoted from the issue: the path, field names and error codes follow the existing registration operation endpoints.
- **L3 (2026-11-06):** delivery follows the repo's chained PR convention (`feat/<issue>-NN-<slug>`, slice 02 targets slice 01), as in `single-action-check-in.md`.
