# Keep activity dates within the event's dates and mark the wrong field

## Tracking

- GitHub issue: #295 (MVP tracking #57)
- Branch: `feat/295-01-activity-window-backend` → `dev` (base `d82b18f`), one commit per task. Delivery strategy: `ask-on-risk` (forecast about 700 authored lines: backend ~250, frontend ~400, docs ~50); chain strategy `stacked-to-main` (user, 2026-10-20): slice 01 backend → `dev`, slice 02 frontend → slice 01, docs with the slice they describe.
- TDD: strict, from the global agent configuration. Runners: backend Jest (`pnpm --filter @nuestro-breaking/backend test`, `test:e2e`), frontend Vitest (`test`) and Playwright (`test:e2e`). Node 24 via nvm.

## Goal

An activity's "Inicio" and "Fin" stay inside a bounded event's dates while the administrator picks them. A date outside the window, or an end not after the start, marks the exact field. The server names the failing fields and returns the current event window, so the form stays correct when the event dates changed while it was open.

## Scope

- Backend: on activity create and update, the `Invalid activity window` 400 adds `fieldErrors` (`startsAt`/`endsAt` → `outside_event_window` | `not_after_start`, every failing field) and `eventWindow` (`{ startsAt, endsAt }` read in the same transaction, or `null` when unbounded). Venue errors and the DB constraint are unchanged.
- Frontend: event window from the foundation response into `CatalogEventContext` and `ActivityForm`; `min`/`max` on the inputs in the event time zone ("Fin" min also the chosen "Inicio"); event-dates hint; field-level validation on submit (`aria-invalid`, danger styling, `aria-describedby` message, focus first invalid); server `fieldErrors` mapping and `eventWindow` replacement. Unbounded events unchanged.
- Docs: `docs/contracts/event-catalog.md` error rows and Admin UI section.
- Out of scope: required event dates, activities already outside an edited window, field errors for other activity fields.

## Tasks

- [x] 1. Backend: `fieldErrors` and `eventWindow` on the activity create and update window failure. Jest unit and PostgreSQL e2e first (both codes, both fields, exact boundaries, unbounded event, nothing written). Route: delegated writer (writer trigger: service, types and two spec layers).
- [ ] 2. Frontend: foundation reader keeps the event window; window-bounds and field-validation model with Vitest (time zone, exact boundaries, minute rounding, `fieldErrors` mapping); `ActivityForm` limits, hint, field errors and focus; Playwright with mocked APIs (out-of-window, highlighting, server `fieldErrors`). Route: delegated writer (writer trigger: reader, model, form, specs).
- [ ] 3. Docs: `docs/contracts/event-catalog.md` (error rows, Admin UI section). Route: inline (one mechanical file). Error rows and body done in slice 01 (`ed020db`); Admin UI section pending with slice 02.

## Acceptance criteria

See issue #295.

## Evidence

- Starting point (2026-10-20): issue #295 locates the window check at `apps/backend/src/events/activity-admin/activity-admin.service.ts:145-166`, the form at `apps/frontend/src/pages/admin/ui/activity-form.tsx:58-91,131-148`, the foundation fields at `event-foundation.types.ts:11-13`, the reader at `entities/event-catalog/api/types.ts:65` and `readers.ts:91`, and the `fieldErrors` pattern at `venue-admin/venue-input.ts:33-42` and `features/public-purchase/model/registration-request.ts:63`. Writers verify them before editing.
- Task 1 on 2026-10-20 (delegated writer): pure `activityWindowErrors` in `activity-admin/activity-window.ts`; `placementProblem` reads the event first and returns `{ message, window? }`, `assertPlacement` throws the 400 body `{ statusCode, message, fieldErrors, eventWindow }`. Precedence: `outside_event_window` wins over `not_after_start` on `endsAt`. Boundaries unchanged (event bounds allowed, end strictly after start). Unordered still reported before `Invalid venue`, outside-window after it; restore 409 unchanged. RED unit (module missing) and e2e 3 failed / 2 passed (the boundary and venue tests lock unchanged behavior); GREEN backend unit 614/614, e2e 476/476, lint and build clean, `pnpm format` clean. Parent spot check: `test -- activity` 10/10. Commit `51503e7`. Contract rows and body `ed020db`. Review assess (base `d82b18f`, committed only): medium, `under_budget` (269 lines), review pending in the slice.

## Next step

Open slice 01 PR, then task 2 on `feat/295-02-activity-window-form` stacked on it.
