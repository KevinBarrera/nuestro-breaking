# Keep activity dates within the event's dates and mark the wrong field

## Tracking

- GitHub issue: #295 (MVP tracking #57)
- Branch: `feat/295-01-activity-window-backend` → `dev` (base `d82b18f`), one commit per task. Delivery strategy: `ask-on-risk` (forecast about 700 authored lines: backend ~250, frontend ~400, docs ~50); chain strategy `stacked-to-main` (user, 2026-10-20): slice 01 backend → `dev`, slice 02 frontend → slice 01, docs with the slice they describe. PRs: #296 `feat/295-01-activity-window-backend` (`51503e7`, `ed020db`, `f603725`) → `dev`, and #297 `feat/295-02-activity-window-form` (`03ff3d8`, `c695e76`, `c322516`) → #296.
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
- [x] 2. Frontend: foundation reader keeps the event window; window-bounds and field-validation model with Vitest (time zone, exact boundaries, minute rounding, `fieldErrors` mapping); `ActivityForm` limits, hint, field errors and focus; Playwright with mocked APIs (out-of-window, highlighting, server `fieldErrors`). Route: delegated writer (writer trigger: reader, model, form, specs).
- [x] 3. Docs: `docs/contracts/event-catalog.md` (error rows, Admin UI section). Route: inline (one mechanical file). Error rows and body done in slice 01 (`ed020db`); Admin UI section in slice 02 (`c695e76`).

## Acceptance criteria

See issue #295.

## Evidence

- Starting point (2026-10-20): issue #295 locates the window check at `apps/backend/src/events/activity-admin/activity-admin.service.ts:145-166`, the form at `apps/frontend/src/pages/admin/ui/activity-form.tsx:58-91,131-148`, the foundation fields at `event-foundation.types.ts:11-13`, the reader at `entities/event-catalog/api/types.ts:65` and `readers.ts:91`, and the `fieldErrors` pattern at `venue-admin/venue-input.ts:33-42` and `features/public-purchase/model/registration-request.ts:63`. Writers verify them before editing.
- Task 1 on 2026-10-20 (delegated writer): pure `activityWindowErrors` in `activity-admin/activity-window.ts`; `placementProblem` reads the event first and returns `{ message, window? }`, `assertPlacement` throws the 400 body `{ statusCode, message, fieldErrors, eventWindow }`. Precedence: `outside_event_window` wins over `not_after_start` on `endsAt`. Boundaries unchanged (event bounds allowed, end strictly after start). Unordered still reported before `Invalid venue`, outside-window after it; restore 409 unchanged. RED unit (module missing) and e2e 3 failed / 2 passed (the boundary and venue tests lock unchanged behavior); GREEN backend unit 614/614, e2e 476/476, lint and build clean, `pnpm format` clean. Parent spot check: `test -- activity` 10/10. Commit `51503e7`. Contract rows and body `ed020db`. Review assess (base `d82b18f`, committed only): medium, `under_budget` (269 lines), review pending in the slice.

- Task 2 on 2026-10-21 (delegated writer): pure model `entities/event-catalog/model/activity-window.ts` (inward minute rounding for `min`/`max`, "Fin" min is the later of event start and "Inicio", Spanish hint with same-day, cross-month and cross-year forms, backend precedence); `readEventContext` parses `eventWindow`; `CatalogError.windowProblem` from `readActivityWindowProblem`; `activity-window-field.tsx`; a capture-phase `invalid` handler marks fields when native `min`/`max` blocks the submit (no `noValidate`, the Select relies on native validation). RED: model module missing, readers 18/62 failed, 5/5 new Playwright failed; GREEN Vitest 663/663, Playwright 516 passed + `admin-select.spec.ts` load timeout that passed 6/6 with `--timeout=120000`; lint and build clean, `pnpm format` clean. Parent spot check: Vitest 663/663. About 920 authored lines, over the 400 heuristic because about 580 are new tests and the model; kept as one coherent behavior. Commit `03ff3d8`.
- Review on 2026-10-21: two START attempts on the selectorless workspace candidate (base `c9c9441`, 609 and 615 files) did not start: the first refused for untracked files, the second `lens_context_budget_exceeded`, no authority created. Scoped to `--base-ref d82b18f --committed-only` (medium, 18 files, 1,245 lines, `slice_budget_reached`), user granted; one reliability lens, approved and acknowledged (lineage review-9218b12a3b11d2fd, authority burned). Informational findings: WARNING `admin-activity-catalog.e2e-spec.ts:233-236` trigger left disabled is not effective, `harness.reset()` drops and recreates the schema before each test (`test/support/postgres-harness.ts:29`); SUGGESTION `catalog-api.ts:74-78` an abort during the 400 body read surfaces as `CatalogError('invalid')` instead of the abort, follow-up.
- Task 3 on 2026-10-21: Admin UI section of `event-catalog.md` (`c695e76`), inline.
- PRs on 2026-10-21: chain-head checks before opening: `pnpm verify:pr` format, frontend lint, build and Vitest 663/663 clean, Playwright 516 passed and 1 failed (`admin-select.spec.ts` no-native-select sweep, 30 s timeout under load; rerun with `--timeout=120000` 6/6, 49.6 s); backend lint clean, unit 614/614, e2e 476/476. The user checked the form locally. Precedence `outside_event_window` confirmed by the user.

## Next step

Merge #296 into `dev`, then #297, bottom-up after CI. Optional follow-up: pass an abort through the 400 body read in `catalog-api.ts:74-78`.
