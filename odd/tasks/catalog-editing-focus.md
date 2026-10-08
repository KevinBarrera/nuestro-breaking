# Catalog editing focus — issue #146

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/146 (source of truth for scope and acceptance criteria)
- Design: https://claude.ai/artifact/FWf7esvJizsGZjmNvSoK8f (row "Ajustes propuestos — revisión manual 7 oct": "Actividades · editar en modal", "Confirmación de guardado y archivo", "Pase · pantalla propia con breadcrumb", "Nuevo pase · con acceso desde el inicio", "Pases · lista")
- Engram mirror: `odd/catalog-editing-focus/tasks`
- Base: `dev` at `3db1c5a`
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #146`, `Closes #146` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `3db1c5a`.
- Follow-up #147 (restore archived) reuses the dialog primitives from T1.

## Objective

Give catalog editing its own focused space and protect it against accidental writes: activities edit in a modal, passes get their own routes with a vertical access list, every save goes through a "Revisar cambios" dialog, archive confirms in a dialog, and leaving a dirty pass screen warns.

## Why

The edit forms and the access matrix render below the lists, need scrolling and save on one click. The dialog, confirmation and route patterns are reused later by #125 (duplicate confirmation) and #104/#105 (corrections with reason), so they belong in `shared/ui`.

## Current state (exploration, 2026-10-07)

- `BrowserRouter` in `src/app/providers/app-providers.tsx`; flat `<Routes>` in `src/app/router/app-router.tsx`. No `useBlocker` without a data router.
- Pass routes live under `/admin/events/:eventId/pass-types` (`src/shared/config/routes.ts:6-7`); the side nav matches with `end: true` (`src/widgets/admin-shell/ui/admin-location.ts:16-22`).
- No Modal, Dialog, AlertDialog or Breadcrumb exists. `shared/ui` holds `select.tsx`, `page-shell.tsx`, `check-icon.tsx`. Button styles are page-local in `src/pages/admin/ui/catalog-copy.ts`.
- Activities have no discipline field; the November seed encodes discipline as a name prefix with `kind: 'competition'`.
- `PassTypeInput` lacks `activities`; the backend POST already accepts optional `activities[]` (`docs/contracts/event-catalog.md:59`). Access edits use a separate PUT.
- Sweeps enumerate `adminScreens`/`revealControls` in `e2e/support/admin-mocks.ts`; `admin-phone-width.spec.ts:43` expects a table on Pases.

## Constraints

- FSD layers and `@/` slice-index imports (`docs/frontend-architecture.md`); Tailwind v4 with `--nb-*` tokens; Spanish copy; 44px targets; 4.5:1 contrast in both themes.
- React Aria Components stays the only third-party UI dependency.
- Vitest for pure logic (diff model, access grouping); Playwright mocked e2e for flows. Test-first where a deterministic RED is observable.
- About 400 authored lines per slice is a planning heuristic, not a cap.

## Open decisions

- D1 (product) — How the access list groups activities "by discipline": by the name prefix, or by activity kind. Pending user answer.
- D2 (technical, default) — Rename the pass routes to `/passes`, `/passes/new` and `/passes/:passTypeId` as the issue states.
- D3 (technical, default) — Move to `createBrowserRouter` + `RouterProvider` so the dirty-leave guard uses `useBlocker`, plus `beforeunload` for reloads.

## Slices and tasks

Forecast: ~1,800 authored lines (source + specs) over 5 PRs.

### PR 1 — `feat/146-01-shared-dialogs`

- [x] T1 — Shared dialog primitives in `shared/ui`: token-styled `Modal`/`Dialog`, `ConfirmDialog` (archive and other destructive confirmations), and a `ReviewChangesDialog` that lists before → after rows. Pure change-diff model with Vitest tests.

### PR 2 — `feat/146-02-activities-modal`

- [ ] T2 — Activities create/edit in the modal with focus restored to the trigger; Esc and Cancel discard. Save goes through "Revisar cambios"; an unchanged form cannot submit. Archive confirms in `ConfirmDialog`. 409 stays visible. Update the e2e specs.

### PR 3 — `feat/146-03-pass-routes`

- [ ] T3 — Data router migration; pass list, `/passes/new` and `/passes/:passTypeId` routes with breadcrumb "Pases › <name>"; unknown pass shows not found; side nav stays highlighted on subroutes.

### PR 4 — `feat/146-04-pass-access-list`

- [ ] T4 — Vertical access list grouped per D1 (pure grouping model with Vitest), replacing the matrix. Create sends `activities[]` in one request. Update `admin-pass-access-map.spec.ts`.

### PR 5 — `feat/146-05-pass-review-and-sweeps`

- [ ] T5 — Pass save through "Revisar cambios", archive dialog, dirty-leave warning. Extend `adminScreens`/`revealControls` and both sweeps to the new dialogs and routes in both themes. Update docs.

## Acceptance criteria

See issue #146. Evidence is recorded per task below.

## Progress

- 2026-10-07 — Exploration done (delegated read-only explorer). Feature doc created.
- 2026-10-07 — T1 done in `d5f3906`: `Modal`, `ConfirmDialog`, `ReviewChangesDialog`, `buttonClass` and the `changedRows`/`hasChanges` model in `shared/ui`; docs note in `docs/frontend-architecture.md`. RED observed (missing model module), then GREEN 5/5. Checks: frontend test 110/110, lint, build, format pass. Exception: no Playwright spec yet because no page uses the dialogs; focus trap, Esc, focus return and 375px fit are covered by T2 flow specs. Next: T2.

## Route per task

- T1 — delegated writer (writer trigger: 6 new files in `shared/ui`).

## Notes for later tasks

- The backdrop uses `bg-header/70`; there is no overlay token yet.
- The new `destructive` button tone is first rendered in T2; the a11y sweep checks it in T5.
