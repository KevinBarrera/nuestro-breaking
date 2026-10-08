# Admin UI walkthrough fixes — issue #145

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/145 (source of truth for scope and acceptance criteria)
- Design: https://claude.ai/artifact/FWf7esvJizsGZjmNvSoK8f (row "Ajustes propuestos — revisión manual 7 oct": ShellTopbar, AdminInicio, CheckInEscritorio, ActividadesEditarModal for chips, PasesLista)
- Engram mirror: `odd/admin-ui-walkthrough-fixes/tasks`
- Base: `dev` at `9f8ce8f`
- Delivery strategy: `auto-chain`, stacked to `dev` (same as #136); one PR per slice (~400 authored lines), `Refs #145`, `Closes #145` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `9f8ce8f`.
- Follow-ups #146 (catalog editing focus) and #147 (restore archived) reuse the React Aria setup from T2.

## Objective

Fix the gaps found in the manual walkthrough after #136. `/admin` lands on a real event. All selects are styled and accessible. The shell keeps its header and sidenav fixed. The theme toggle reflects the current state. Check-in shows the event name. Selected chips are distinguishable. Pass cards have one target. The product name becomes "Los más pesados".

## Constraints

- FSD layers and `@/` slice-index imports (`docs/frontend-architecture.md`); Tailwind v4 with `--nb-*` tokens; Spanish copy; 44px targets; 4.5:1 contrast in both themes.
- React Aria Components is the only new UI dependency (user decision, 2026-10-07).
- Repository, package names and seed organization keep "Nuestro Breaking": the seed matches its organization and event by name.
- Playwright mocked e2e is the only frontend runner; test-first where a deterministic RED is observable.

## Slices and tasks

Forecast: ~1,200 authored lines over 4 PRs.

### PR 1 — `feat/145-01-brand-rename`

- [x] T1 — Rename the visible product name to "Los más pesados": `index.html` title, the admin shell brand, the sign-in, foundation and page-shell headings, the `/admin` eyebrow, and the backend Swagger title and description. Update the e2e specs. Rename the seed event to "Los más pesados - Preliminares - Noviembre 2026" and document the local DB step, because a re-run creates a second event.

### PR 2 — `feat/145-02-shared-select`

- [x] T2 — Add `react-aria-components` and a shared `Select` in `shared/ui` styled with tokens. Replace the native selects: topbar `event-selector.tsx`, `activity-form.tsx`, `pass-type-form.tsx` and `pass-access-map.tsx`. Keyboard and accessible-name coverage.

### PR 3 — `feat/145-03-shell-and-theme-toggle`

- [x] T3 — Fixed shell: the header and sidenav stay in place and only the main area scrolls on desktop. The mobile layout stays usable with no horizontal scroll.
- [x] T4 — Icon-only theme toggle: sun in dark, moon in light. The accessible name states the action.

### PR 4 — `feat/145-04-entry-check-in-and-states`

- [x] T5 — `/admin` event picker: no sample content. One event redirects to it, several show a picker, zero show an empty state.
- [x] T6 — Check-in shows the event name instead of the UUID. The fallback link goes to the event overview.
- [x] T7 — The selected chip differs in lightness in both themes, and contrast checks are extended to chip state. Pass cards have a single interactive target with no "Editar" button.

## Acceptance criteria

See issue #145; mapped to evidence below under "Acceptance criteria evidence".

## Progress and evidence

### PR 1 — T1

- Route: delegated direct — one bounded writer (trigger: 2+ non-trivial files across frontend, backend and e2e).
- Commits: `6383515` feat(frontend): show Los más pesados as the product name; `66f68bd` chore(seed): rename the November seed event.
- RED: the updated e2e assertions failed against the old copy (3 failed, 23 passed in `admin-shell.spec.ts` + `route-placeholders.spec.ts`).
- GREEN: same two specs 26 passed; full mocked `npx playwright test` 113 passed.
- Frontend `npm run lint`: 0 errors, 2 pre-existing warnings in `admin-check-in-page.tsx` (same on the base); `npm run build`: passed.
- Backend `npm run lint`: passed; `npm run build`: passed; `npx jest` (unit): 35 passed. No backend test asserts the event name; DB e2e not run.
- Prettier check on changed files: passed.
- Remaining `git grep -niI "nuestro breaking" -- apps`: the seed organization name (intended) and `apps/backend/README.md` (repository/project description, out of the allowed edit surfaces).
- Seed note: `docs/contracts/event-catalog.md` "Local seed" documents the rename-row or volume-reset steps; no dedicated reset script exists.

- Parent: `apps/backend/README.md` brand line fixed in `ca6d94d`. Spot check: `npx playwright test e2e/admin-shell.spec.ts e2e/route-placeholders.spec.ts` gave 26 passed. Review assess for `9f8ce8f..ca6d94d`: medium, `review_due` false (`under_budget`), so it stays pending in the slice.

### PR 2 — T2

- Route: delegated direct — one bounded writer (trigger: 2+ non-trivial files across shared UI, widget, pages and e2e).
- Commit: `1a99d9b` feat(admin): replace native selects with a shared accessible Select (`react-aria-components` 1.21.1).
- RED: new `e2e/admin-select.spec.ts` failed against the native selects (4 failed: no exposed native select, Enter and ArrowDown open the topbar listbox and navigate, re-choosing the current event does not navigate).
- GREEN: `admin-select`, `admin-accessibility` and `admin-phone-width` 26 passed; full mocked `npx playwright test` 125 passed (113 base + 4 select + 4 listbox target/contrast + 4 listbox phone width).
- Frontend `npm run lint`: 0 errors, the 2 pre-existing warnings in `admin-check-in-page.tsx`; `npm run build`: passed; Prettier check: passed; `git grep -n "<select" -- apps/frontend/src`: no matches.
- Caveat: React Aria always renders an `aria-hidden`, untabbable native `<select>` for autofill and `FormData`, so specs assert that no _exposed_ native select remains instead of a zero `select` count. No admin form reads `FormData`; all keep controlled state.
- Interaction specs now use `e2e/support/select.ts` (`selectTrigger`, `chooseOption`, `expectSelected`); the trigger's accessible name is the value followed by the label.
- T2 review: `review-c6f7dac9bb7b79c4` (medium, reliability lens, granted, approved and acknowledged; range `9f8ce8f..086e8ba`) with two non-blocking findings. R3-activity-venue-required-dropped fixed in `b94fea6` (shared Select `isRequired` with a Spanish `FieldError`; a saved venue missing from the event venues counts as unselected and shows "Elige una sede"; RED observed first). R3-space-open-untested fixed in `04d9dc2` (Space in the keyboard-open loop, Escape closes and refocuses the trigger). Frontend lint: 0 errors, the 2 known warnings; build: passed; full mocked `npx playwright test`: 128 passed.

### PR 3 — T3–T4

- Route: delegated direct — one bounded writer (trigger: 2+ non-trivial files across the shell widget, the theme-toggle feature, e2e and docs).
- Commits: `7777f89` feat(admin): keep the header and side navigation fixed while content scrolls; `7d0d646` feat(admin): show an icon-only theme toggle that names its action.
- T3 approach: from `md` up the shell is `h-dvh` with `overflow-hidden`; header and brand bar are `shrink-0`, the body row is `md:min-h-0`, the side navigation and the content column around each page's `<main>` get their own `md:overflow-y-auto`. No `position: fixed`, so nothing hides under the header. The shell scrolls the content column to the top on every `pathname` change (the app had no window scroll reset before). Below `md` the layout stays stacked with natural document scroll. The scroller is the column around `<main>`, not `<main>` itself, because pages own their `<main>`.
- T3 RED: new `e2e/admin-fixed-shell.spec.ts` failed on the old layout (the document scrolled instead of the content). With the layout but before the reset effect, the route-change spec failed (content scroll kept after navigating). GREEN: 3 passed.
- T4: icon-only 44×44 button, moon named "Cambiar a tema oscuro" in light and sun named "Cambiar a tema claro" in dark, matching `title`, `aria-hidden` SVG, no `aria-pressed`; the `aria-pressed:` hook left `admin-shell.tsx`. Specs updated in `admin-shell`, `admin-event-foundation` and `route-placeholders` (no visible text, 44px both ways, focus outline, name flips, persists across reload).
- T4 RED: the updated specs failed against the labelled toggle (4 failed, 28 passed). GREEN: those specs plus `admin-accessibility` 42 passed.
- Verification: frontend `npm run lint` 0 errors, the 2 known warnings in `admin-check-in-page.tsx`; `npm run build` passed; full mocked `npx playwright test` 131 passed (128 base + 3 fixed shell); Prettier check passed.
- Caveat: no skip link exists in the app, so none was added; the React Aria listbox renders at the end of `<body>`, outside the scroll container.

### PR 4 — T5–T7

- Route: delegated direct — one bounded writer (trigger: 2+ non-trivial files across pages, shared UI, styles, e2e and docs).
- Commits: `d3840f2` feat(admin): replace the sample /admin view with a real event picker; `b029ad6` fix(admin): show the event name on check-in; `4af7cad` fix(admin): make selected filter chips stand out and pass cards a single target.
- T5: `/admin` is an "Eventos" picker from `listCatalogEvents` (`@/entities/event-catalog`) through `useCatalogLoad`: loading, access-denied, error with "Reintentar", empty ("No hay eventos disponibles para tu cuenta.") and one card per event (name as `h2`, "Abrir evento" to the overview, Check-in / Actividades / Pases). Exactly one event redirects with `<Navigate replace>`. A list with any non-UUID ID is rejected as an error, as before. All sample and planning content and copy are gone. `e2e/admin-check-in-entry.spec.ts` became `e2e/admin-event-picker.spec.ts`; `route-placeholders`, `admin-event-catalog` and the live `live-check-in` spec (not run: needs the live backend) follow the new page.
- T5 RED: the new picker spec failed 6 of 8 against the sample view. GREEN: 8 passed; with `route-placeholders`, `admin-event-catalog` and `admin-shell` 54 passed.
- T6: `pages/admin/ui/use-event-name.ts` resolves the name from `listCatalogEvents` (entity layer, no widget import and no move needed). The eyebrow reads "Administración · <name>", or "Administración" while loading, on failure or when the event is not listed. The fallback link reads "…Consulta al responsable o vuelve al resumen del evento." and targets `/admin/events/:eventId`. Moving the `eslint-disable` comment onto the ref line cleared the file's two long-standing lint warnings.
- T6 RED: 5 failed in `admin-check-in.spec.ts` (name, two fallback cases, overview link, event switch). GREEN: 13 passed.
- T7: new `--nb-chip-selected-bg`/`-fg` tokens (light `#21185f`/`#fff4a8`, dark `#f3e9a6`/`#21185f`) exposed as `bg-chip-selected`/`text-chip-selected-fg`; unselected chips are transparent with a border; the selected chip shows `CheckIcon`, now exported from `@/shared/ui` and shared with `Select`. Pass cards: the visible "Editar" button is gone; an `absolute inset-0` button named "Editar <pass name>" (screen-reader text) covers the card, with a card-sized focus outline, `aria-pressed` kept; archived cards have no button.
- T7 RED: 24 failed (missing chip token, chip luminance/contrast per theme, pass-card name and target specs). GREEN: affected specs 74 passed after one spec fix (the price click now uses mouse coordinates because the overlay intercepts element clicks by design).
- Verification: frontend `npm run lint` 0 problems (the 2 old warnings are gone); `npm run build` passed (after folding a `use-event-name.ts` null-check fix into `b029ad6`); full mocked `npx playwright test` 140 passed; Prettier check passed.
- T3–T7 review: `review-a52873433910900f` (medium, reliability lens, granted, approved and acknowledged; range `086e8ba..b8e01cb`) with two non-blocking findings. R3-event-name-fallback-negative-race fixed in `ac9aeaf`: `useEventName` reports `loading`/`resolved`/`unavailable` as `data-event-name-state` on the eyebrow, and the fallback specs wait for `unavailable` (set only after the page handled its own response, not the shell selector's) before asserting no name and no UUID; reintroducing the UUID in the fallback made both specs fail (then reverted). Frontend lint 0 problems; build passed; full mocked `npx playwright test` 140 passed. R3-live-check-in-unexecuted-path: `e2e/live-check-in.spec.ts` (updated for the single-event redirect and the overview's "Abrir check-in" link at `admin-event-overview-page.tsx:89`) still needs a run against the live backend (`npm run test:e2e:live`) by the user.

## Acceptance criteria evidence

- `/admin` shows no sample data; one event redirects, several show a picker, zero show an empty state: T5, `e2e/admin-event-picker.spec.ts`, `route-placeholders.spec.ts`.
- No native `<select>`; the shared Select works with keyboard and screen reader in both themes: T2, `e2e/admin-select.spec.ts`, `admin-accessibility.spec.ts` popover sweep.
- Theme toggle icon and accessible name reflect the theme, covered by a test: T4, `admin-shell.spec.ts`.
- Header and sidenav stay visible while content scrolls on desktop; no horizontal scroll on mobile: T3, `e2e/admin-fixed-shell.spec.ts`, `admin-phone-width.spec.ts`.
- Check-in never renders an event UUID; the fallback link targets the overview: T6, `admin-check-in.spec.ts`.
- Selected chip distinguishable in both themes; contrast checks cover chip state: T7, `admin-accessibility.spec.ts` chip tests and the `chip-selected` token pair.
- Pass cards have a single interactive target: T7, `admin-event-catalog.spec.ts` pass-card target and keyboard specs.
- "Los más pesados" replaces "Nuestro Breaking" in the UI, specs updated: T1, `admin-shell.spec.ts`, `route-placeholders.spec.ts`.
- Seed uses the new event name and the local setup docs explain how to pick it up: T1, `66f68bd`, `docs/contracts/event-catalog.md` "Local seed".

## Next step

Open the chained PRs (user decision); run `npm run test:e2e:live` against the live backend first.
