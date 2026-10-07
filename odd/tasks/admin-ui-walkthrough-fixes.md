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

- [ ] T2 — Add `react-aria-components` and a shared `Select` in `shared/ui` styled with tokens. Replace the native selects: topbar `event-selector.tsx`, `activity-form.tsx`, `pass-type-form.tsx` and `pass-access-map.tsx`. Keyboard and accessible-name coverage.

### PR 3 — `feat/145-03-shell-and-theme-toggle`

- [ ] T3 — Fixed shell: the header and sidenav stay in place and only the main area scrolls on desktop. The mobile layout stays usable with no horizontal scroll.
- [ ] T4 — Icon-only theme toggle: sun in dark, moon in light. The accessible name states the action.

### PR 4 — `feat/145-04-entry-check-in-and-states`

- [ ] T5 — `/admin` event picker: no sample content. One event redirects to it, several show a picker, zero show an empty state.
- [ ] T6 — Check-in shows the event name instead of the UUID. The fallback link goes to the event overview.
- [ ] T7 — The selected chip differs in lightness in both themes, and contrast checks are extended to chip state. Pass cards have a single interactive target with no "Editar" button.

## Acceptance criteria

See issue #145; mapped to evidence at closure.

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

## Next step

T2 on `feat/145-02-shared-select`, stacked on PR 1.
