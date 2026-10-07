# Admin UI redesign — issue #136

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/136 (source of truth for scope, tokens and acceptance criteria)
- Design: https://claude.ai/artifact/FWf7esvJizsGZjmNvSoK8f (boards Main, Pases, Actividades, CheckIn and *Oscuro variants)
- Engram mirror: `odd/admin-ui-redesign/tasks`; handoff: `frontend/admin-ui-redesign-handoff`
- Base: `dev` at `fdd9477`
- Delivery strategy: `auto-chain`, chain strategy stacked to `dev`; one PR per slice (~400 authored lines), `Refs #136`, `Closes #136` on the last PR, label `type:feature`, no `Co-Authored-By`.
- History: semi-linear. Several granular conventional commits per PR; before merging, rebase the branch onto `origin/dev` and merge with a merge commit (no squash, no rebase-merge).
- Review: risk assessment per work-unit commit (`gentle-ai review assess --base-ref <last reviewed boundary> --committed-only`). Any review spanning everything since `df49d48` is always skipped.

## Objective

Restyle the admin interface with the event palette, user-selectable persisted light/dark themes, a shared shell with full-height side navigation, a Resumen screen, a Pases screen with an editable access map, an Actividades agenda, and a style-only Check-in restyle, using only behavior the backend already supports.

## Constraints

- FSD layers and `@/` slice-index imports (`docs/frontend-architecture.md`); Tailwind v4; Spanish copy; 44px touch targets; 4.5:1 text contrast (3:1 large) in both themes.
- Archivo + IBM Plex Mono from Google Fonts with system fallbacks.
- Check-in: visual restyle only, behavior unchanged; existing specs keep passing.
- No backend: "Registrar en el lugar" (#105/#125), "Imprimir listas" (#65), Inscripciones, Listas de respaldo → visibly disabled or hidden. Omit the "Por confirmar con organización" list. No invented data.
- Playwright mocked e2e is the only runner; test-first where a deterministic RED is observable.

## Slices and tasks

Forecast: ~1,900 authored lines over 5 PRs.

### PRs 1–3 — theme and shell (slices: `feat/136-01-theme-foundation` = c13fe77..059f4f1, +317/−2; `feat/136-02-admin-shell` = 8ed10f4, +337/−76; `feat/136-03-admin-theme-pages` = 5f5e609..review follow-ups, +297/−127)

- [x] T1 — Theme tokens and fonts: light/dark CSS custom properties from the issue, `data-theme` on `<html>`, Google Fonts with fallbacks, `lang="es"`.
- [x] T2 — Theme preference: safe persisted toggle (storage failures fall back to light without crashing), no flash on load.
- [x] T3 — Admin shell widget: header (brand, event selector from `GET /admin/events`, theme toggle, sign-out), brand bar, full-height side navigation with Operación/Catálogo groups, disabled Inscripciones and Listas de respaldo; phone-width stacking. Playwright coverage for shell and theme toggle.

### PR 4 — `feat/136-04-admin-overview`

- [x] T4 — Resumen: quick actions (Abrir check-in active; unsupported actions disabled), catalog counts from catalog APIs, pass table in a scroll box.

### PR 5 — `feat/136-05-pass-access-map`

- [ ] T5 — Pases: pass cards and edit panel restyle.
- [ ] T6 — Editable access map (activities × pass types; Elegible/Incluida) via `PUT .../pass-types/:passTypeId/activities` with `expectedVersion`; 409 shows a reload path. Playwright coverage of the PUT body and conflict.

### PR 6 — `feat/136-06-activity-agenda`

- [ ] T7 — Actividades agenda grouped by day in the event time zone, kind filters, search, archived toggle, workshop empty state. Playwright coverage.

### PR 7 — `feat/136-07-check-in-restyle`

- [ ] T8 — Check-in visual restyle only; existing specs unchanged and passing.
- [ ] T9 — Contrast and phone-width pass across screens; docs update.

## Acceptance criteria

See issue #136. Mapped: themes/contrast/targets → T1–T3, T9; persistence → T2; access map PUT/409 → T6; agenda → T7; disabled actions → T3, T4; check-in → T8; phone width → T3, T9; Playwright → T3, T6, T7.

## Progress and evidence

### PR 1 (route: delegated direct — one bounded writer; trigger: 2+ non-trivial files)

- T1 — `c13fe77 style(admin): add light and dark theme tokens and event fonts`. Semantic `--nb-*` tokens per theme under `:root[data-theme]`, exposed via `@theme inline` as Tailwind colors (`bg-surface`, `text-muted`, `border-line`, `bg-primary`, `bg-eligible`, `bg-included`, `bg-nav-active`, ...), plus `bg-page` and `bg-brand-bar` utilities; Archivo + IBM Plex Mono with system fallbacks; `lang="es"`. Test-first exception: styling only, no meaningful RED; checked by build and a scripted contrast check (all text pairs ≥ 4.5:1 in both themes). Unspecified light success/warning/danger and dark warning/danger backgrounds were chosen to pass 4.5:1.
- T2 — `059f4f1 feat(admin): persist a safe light/dark theme preference`. `@/shared/lib` theme helpers (guarded localStorage, key `nb-theme`), `@/features/theme-toggle` (`aria-pressed` button "Tema oscuro"), guarded pre-paint script in `index.html`. RED observed: the three theme tests in `e2e/admin-shell.spec.ts` failed before the change (no `data-theme`); GREEN after.
- T3 — `8ed10f4 feat(admin): add shared admin shell with side navigation` and `style(admin): map admin pages onto theme tokens` (this commit). `@/widgets/admin-shell` rendered by `AdminSessionBoundary`. RED observed: shell nav/selector tests failed before the widget; GREEN after. Existing specs updated because the home link moved from the header to the side nav and is now "Resumen" (`route-placeholders`, `admin-event-foundation`, `admin-check-in` mobile test); check-in behavior unchanged.
- Checks: lint (0 errors, 2 pre-existing warnings in `admin-check-in-page.tsx`), build, full Playwright suite (60 passed), `pnpm format:check`, `git diff --check`.
- PR 1 review follow-ups (approved review, three non-blocking R3 findings; route: delegated direct):
  - R3-external-font-blocking — `d7fcf86 perf(admin): load event fonts without blocking render`. `rel="preload"` + `onload` swap to stylesheet with a `<noscript>` fallback; preconnect, `display=swap` and system fallbacks kept. Playwright Chromium launches with `--host-resolver-rules` mapping both font hosts to NOTFOUND, so all specs fail font DNS instantly with no per-spec changes; a shell test asserts no font request finishes and the page still renders.
  - R3-tab-order-depends-on-unmocked-events — `649337a test(admin): mock admin events in keyboard order tests`. Foundation 375px test mocks `GET /admin/events` with the current event, so Tab order is selector → Tema oscuro → Cerrar sesión → Resumen; the `/admin` header test mocks a non-empty list and asserts no selector (no event in URL). `admin-check-in.spec.ts` has no Tab-order test.
  - R3-selector-guard-uncovered — `test(admin): cover event selector guards` (this commit). Selector stays hidden on an event route when the list lacks the current event, on 500, on entries without `name`, and on a non-JSON body.
  - Checks: lint (0 errors, 2 pre-existing warnings), build, full Playwright suite (65 passed), `pnpm format:check`, `git diff --check`.

### PR 4 (route: delegated direct — one bounded writer; trigger: 2+ non-trivial files)

- Tooling — `46902ba chore(frontend): typecheck e2e specs through tsconfig.node`. A ninth e2e spec exceeded typescript-eslint's 8-file `allowDefaultProject` limit; per user decision, `playwright.config.ts` and `e2e` joined `tsconfig.node.json` (`lib` gains `DOM`, `DOM.Iterable`), and `eslint.config.js` uses `projectService: true`, so `tsc -b` now typechecks specs. Minimal type fixes in `admin-check-in.spec.ts` (nullable `checkedInAt`) and `route-placeholders.spec.ts` (browser-only dynamic import path held in a variable). Verified alone: lint, build, e2e (65 passed).
- T4 — `11fa996 feat(admin): list manageable events from the catalog client` (`listCatalogEvents` with a guard; verified alone: lint, build, e2e 65 passed) and `eb5a0d8 feat(admin): add event overview with quick actions, catalog counts and pass table`. Route `/admin/events/:eventId` is an `overview` section in `admin-location.ts`, so side-nav Resumen links there (and is `aria-current`) when an event is in the URL, falls back to `/admin` otherwise, and the event selector keeps the overview. Event name from `GET /admin/events` (failure omits it; no invented dates/venues; "Por confirmar" list omitted). Counts: active pass types plus one entry per active activity kind (known kinds labelled in Spanish, unknown kinds shown raw; zero-count kinds and the workshop note omitted). Includes column counts only active activities: "N actividad(es) a elegir", "Incluye A y B" (or "N actividades incluidas" above two), "Sin actividades", plus "Requiere pase completo/general" for add-ons. Registrar en el lugar and Imprimir listas are `aria-disabled` buttons with "Próximamente". `admin-event-foundation.spec.ts` updated: Resumen from an event route now opens that event's overview. The page commit is about 520 authored lines (spec about 230), above the advisory 400 heuristic, kept whole so route, page and tests land together.
- RED observed: `e2e/admin-overview.spec.ts` 8/8 failed before the route existed; GREEN 8/8 after (two spec defects fixed on the way: mocks now take `eventId` from the request path, rows matched by row header).
- Checks: lint (0 errors, 2 pre-existing warnings), build, full Playwright suite (73 passed), `pnpm format:check`, `git diff --check`.

## Next step

Slices split by the chained-pr pass (one pass; each slice verified alone: build, lint, full e2e). Review: `review-c590b22230a870f6` approved and acknowledged on fdd9477..5f5e609 (medium, granted, 1 reliability lens, 3 advisory findings fixed in d7fcf86, 649337a, 3e67302 — each assessed medium/under_budget, pending in the slice from boundary 5f5e609). The hook-issued review of everything since `df49d48` was declined per standing user instruction. Open PRs 1–3 stacked to `dev`; then T4 on `feat/136-04-admin-overview` from `feat/136-03-admin-theme-pages`. T4 done on `feat/136-04-admin-overview`; next T5–T6 on `feat/136-05-pass-access-map`.
