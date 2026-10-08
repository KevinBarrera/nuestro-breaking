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

- D1 (product, decided 2026-10-07) — The access list groups activities by activity kind. The user chose kind because every current activity is a competition; a real discipline field can come later if needed.
- D2 (technical, default) — Rename the pass routes to `/passes`, `/passes/new` and `/passes/:passTypeId` as the issue states.
- D3 (technical, default) — Move to `createBrowserRouter` + `RouterProvider` so the dirty-leave guard uses `useBlocker`, plus `beforeunload` for reloads.

## Slices and tasks

Forecast: ~1,800 authored lines (source + specs) over 5 PRs.

### PR 1 — `feat/146-01-shared-dialogs`

- [x] T1 — Shared dialog primitives in `shared/ui`: token-styled `Modal`/`Dialog`, `ConfirmDialog` (archive and other destructive confirmations), and a `ReviewChangesDialog` that lists before → after rows. Pure change-diff model with Vitest tests.

### PR 2 — `feat/146-02-activities-modal`

- [x] T2 — Activities create/edit in the modal with focus restored to the trigger; Esc and Cancel discard. Save goes through "Revisar cambios"; an unchanged form cannot submit. Archive confirms in `ConfirmDialog`. 409 stays visible. Update the e2e specs.

### PR 3 — `feat/146-03-pass-routes`

- [x] T3 — Data router migration; pass list, `/passes/new` and `/passes/:passTypeId` routes with breadcrumb "Pases › <name>"; unknown pass shows not found; side nav stays highlighted on subroutes.

### PR 4 — `feat/146-04-pass-access-list`

- [x] T4 — Vertical access list grouped by kind (D1) (pure grouping model with Vitest), replacing the matrix. Create sends `activities[]` in one request. Update `admin-pass-access-map.spec.ts`.

### PR 5 — `feat/146-05-pass-review-and-sweeps`

- [x] T5 — Pass save through "Revisar cambios", archive dialog, dirty-leave warning. Extend `adminScreens`/`revealControls` and both sweeps to the new dialogs and routes in both themes. Update docs.

## Acceptance criteria

See issue #146. Evidence is recorded per task below.

## Progress

- 2026-10-07 — Exploration done (delegated read-only explorer). Feature doc created.
- 2026-10-07 — T1 done in `d5f3906`: `Modal`, `ConfirmDialog`, `ReviewChangesDialog`, `buttonClass` and the `changedRows`/`hasChanges` model in `shared/ui`; docs note in `docs/frontend-architecture.md`. RED observed (missing model module), then GREEN 5/5. Checks: frontend test 110/110, lint, build, format pass. Exception: no Playwright spec yet because no page uses the dialogs; focus trap, Esc, focus return and 375px fit are covered by T2 flow specs. Review: medium risk (`slice_budget_reached`, 411 lines), consent granted, one reliability lens approved and acknowledged (lineage `review-a48a2921e75d7f73`, authority burned). Advisory only: a custom `format` bypasses the empty "—" display, object comparison depends on key order, and the `ConfirmDialog` pending guard is untested (cover in T2 e2e). Next reviewed boundary: `2696011`.
- 2026-10-07 — T2 done in `6af5a61`: activities create/edit in `Modal`, review before every save (create shows "—" before), unchanged edit blocked with an inline alert (button stays focusable), archive in a destructive `ConfirmDialog` with pending state, 409/not-found close the dialogs so the page alert with "Recargar" is visible. Pure `activityChangeRows` helper. RED observed (missing module; 7/7 new e2e failing), then GREEN. Checks: Vitest 114/114, lint, build, full e2e 140 passed (sweeps included), format. Parent spot check: `admin-activities-modal.spec.ts` 7/7. ~720 authored lines (250 are the new flow spec); kept as one unit. Review: medium (`slice_budget_reached`, 729 lines), consent granted, reliability lens approved and acknowledged (lineage `review-a75d466a647b1d5c`). Advisory only (R3-001/R3-002 warnings on failure handling at `admin-event-activities-page.tsx:92-95` and `:210-212`, R3-003 suggestion at `activity-form.tsx:83-87`); revisit in T5. Next reviewed boundary: `85e47f5`.
- 2026-10-07 — T3 done in `fbc8a86`: data router (`createBrowserRouter` + `RouterProvider`), pass routes `/passes`, `/passes/new`, `/passes/:passTypeId` as a layout route sharing catalog data through `Outlet` context, shared `Breadcrumbs`, not-found state for unknown or archived passes, `/pass-types` redirect, nav matcher for subroutes. After create → detail; after update → stay; after archive → list. The access matrix now shows only on the detail screen until T4. RED 9/9 failing on the new `admin-pass-routes.spec.ts`, then GREEN. Checks: Vitest 119/119, lint, build (pre-existing >500 kB chunk warning not compared), full e2e 149 passed (sweeps included), format. Parent spot check: `admin-pass-routes.spec.ts` 9/9. ~1,040 changed lines (renames and spec URL updates included). Review: medium (`slice_budget_reached`, 1,228 lines), consent granted, reliability lens approved and acknowledged (lineage `review-2bb53dfb1bb90f39`). Advisory only: R3-001 warning at `admin-event-passes-page.tsx:74-75`, R3-002 suggestion at `:168`; revisit in T5.
- 2026-10-07 — T4 done in `5a0abcb`: `pass-access-map.tsx` replaced by `pass-access-list.tsx` (vertical list for the open pass, grouped by kind, sorted by start time then name; region "Acceso a actividades", controls "Acceso a <actividad>"). Create sends `activities[]` (non-"Sin acceso" rows, `[]` when none) through a new `NewPassTypeInput`, so create-only fields never leak into the PATCH. A 400 on create with access shows a specific message (inferred: the client keeps only the status). Rows show no times because the passes layout does not load the event time zone. Pure `pass-access-model` with Vitest. RED (missing module; 12/13 e2e failing), then GREEN. Checks: Vitest 124/124, lint, build, full e2e 151 passed (sweeps included), format. Parent spot check: `admin-pass-access-list.spec.ts` 13/13. Review: medium (1,707 lines), consent granted, reliability lens approved and acknowledged (lineage `review-aeb51e3ddd91d420`). Advisory only: R3-001 warning at `admin-event-passes-page.tsx:105-106`, R3-002 suggestion at `admin-pass-access-list.spec.ts:528-544`; revisit in T5.
- 2026-10-07 — T5 done in `19e8258`: pass create, field and access saves each go through "Revisar cambios" (two saves, each one write; PATCH applied in place so the next PUT sends the new version; access editor keyed by saved links plus a reset counter so a field save keeps unsaved access edits). Unchanged saves show "No hay cambios para guardar.". Pass archive in a destructive `ConfirmDialog`. Shared `UnsavedChangesGuard` (`useBlocker` + `beforeunload`) on create and detail. 409 visible on PATCH and PUT. Focus moves to the heading after an activity archive. Sweeps cover "Pases", "Pase", "Nuevo pase" and four dialogs in both themes. Advisories: activities 210-212 fixed, passes 168 fixed (notice cleared on navigation), passes 105-106 copy reworded and tested, access spec strengthened, others reviewed with no change. RED 10/10 on `admin-pass-review.spec.ts`, then GREEN. Checks: Vitest 129/129, lint, build, full e2e 185 passed (sweeps included), format. Parent spot check: `admin-pass-review.spec.ts` 11/11. ~1,400 authored lines, mostly specs.
- Acceptance criteria: all seven #146 criteria plus the dirty-leave warning map to specs (see T2–T5 entries). Review: medium (1,404 lines), consent granted, reliability lens approved and acknowledged (lineage `review-4f633359240e885b`). Advisory only: R3-001 warning on the detail review `confirm` at `pass-screens.tsx:187-193` (closes the review regardless of the write result), R3-002 suggestion at `admin-pass-access-list.spec.ts:360`; follow-up candidates. 
- 2026-10-07 — Published with user approval: #159 (PR 1 → `dev`), #160 → #159's branch, #161 → #160's, #162 → #161's, #163 → #162's (`Closes #146`), all labeled `type:feature`. Next: CI, then the user merges bottom-up (retarget each child to `dev`, rebase, merge commit) and asks Claude to verify; then #147.

## Route per task

- T1 — delegated writer (writer trigger: 6 new files in `shared/ui`).

- T2 — delegated writer (writer trigger: 3 non-trivial source files + 3 specs).

- T3 — delegated writer (writer trigger: router, shell and pass pages).

- T4 — delegated writer (writer trigger: access list, screens, API types and specs).

- T5 — delegated writer (writer trigger: pass screens, shared guard and sweeps).

## Notes for later tasks

- The backdrop uses `bg-header/70`; there is no overlay token yet.
- The new `destructive` button tone is first rendered in T2; the a11y sweep checks it in T5.
- After a successful archive, focus falls back to the page because the row's "Archivar" button disappears. Revisit in T5.
- The pass screen still has its inline "Confirmar archivo" (`pass-type-form.tsx:148`); T5 replaces it.
- Use `pnpm exec playwright test <spec>` from `apps/frontend` to run one spec.
