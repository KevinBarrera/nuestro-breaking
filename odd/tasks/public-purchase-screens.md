# Public purchase screens — issue #176

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/176 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Design: https://claude.ai/artifact/3YcyJrmcNummhmW4DijMGW, boards 1–5 (`Main`, `Pases`, `Competencias`, `Datos`, `Revisar`) and `PasesEscritorio` for desktop. Local copies for writers: read with the Artifact tool (`project/<Board>.dc.html`); the parent passes them to writers.
- Engram mirror: `odd/public-purchase-screens/tasks`
- Base: `dev` at `bb9936d` (#174 and #175 merged)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #176`, `Closes #176` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `bb9936d`. Review consent is granted without asking when RDD says a review is due on a newly finished task (user instruction).

## Objective

Let a buyer on a phone (desktop supported) go through screens 1–5 of the design without login, using the real public catalog and creating a real pending registration.

## Decisions

- D1 (user, 2026-10-08) — Until Mercado Pago exists (#177), "Pagar" creates the pending registration through `POST /public/events/:slug/registrations` and shows a temporary screen: the registration is reserved and online payment will be available soon. #177 replaces that screen with the redirect.
- D2 (technical default) — Routes: `/` shows the event configured by `VITE_PUBLIC_EVENT_SLUG`; `/e/:slug` is the same flow for any event (D1 of #175). Steps are URL sub-paths so the browser back button works; the in-progress purchase lives in memory plus `sessionStorage` (per slug) so a refresh keeps it.
- D3 (technical default) — The design's palette (navy, cream, magenta, yellow, gradient bar) is adapted to the existing `--nb-*` tokens in both themes; no raw hex in components.
- D4 (technical default) — Closed sales: the home shows the event and a closed message with the opening date when known, and no buy button.
- D5 (technical default) — Legal checkboxes are required in the UI; their documents are placeholders until #180 and acceptance is not sent to the backend yet.
- D6 (technical default) — The competitions step is skipped when the chosen passes offer no selectable competitions.
- D7 (technical default) — Admin pages are lazy-loaded so buyers don't download them.

## Current state (exploration, 2026-10-08)

- `/` falls to `NotFoundPage` (`apps/frontend/src/app/router/app-router.tsx:59`); routes in `src/shared/config/routes.ts`; eager `createBrowserRouter`; `AdminSessionBoundary` wraps only `/admin`.
- `sales-model.ts:38-39` already uses `/e/<slug>` as the public address.
- Tokens in `src/app/styles/index.css` (light `:72-112`, dark `:114-153`); fonts Archivo + IBM Plex Mono already loaded; `body` has a dark gradient, so public roots need `bg-page`.
- Shared UI has buttons, modal, confirm, select, breadcrumbs; no input, checkbox, field or notice.
- API clients always send credentials + CSRF; public routes must not (CORS `credentials: false`). Reuse only `apiUrl` and the error-class pattern.
- `formatMxn` and zoned-time formatters in `@/entities/event-catalog`.
- Vitest is Node-only (`src/**/*.test.ts`); Playwright mocks via `page.route` on port 3000 (`e2e/support/admin-mocks.ts`); sweeps list `adminScreens` and assume admin navigation; no axe.

## Constraints

- FSD: downward imports, slice `index.ts`, `@/` alias, no `../`.
- Spanish UI copy; 44px targets; 4.5:1 contrast in both themes; no horizontal scroll at 375px.
- Test-first where a deterministic RED is observable. About 400 authored lines per slice is a planning heuristic, not a cap.

## Slices and tasks

Forecast: ~1,800–2,300 authored lines over 4 PRs.

### PR 1 — `feat/176-01-purchase-model`

- [x] T1 — Public API slice (catalog read and registration create, credential-less, typed errors: field errors, 409 codes, sales closed, 429), pure purchase model (selection rules: full disables general, Open Styles needs a full pass, competitions per purchased pass; totals; buyer validation mirroring the backend with Spanish messages; server field-error mapping; draft serialization), and shared form components (text field, checkbox, field error). Vitest.

### PR 2 — `feat/176-02-home-and-passes`

- [ ] T2 — Public routes (`/`, `/e/:slug`, step sub-paths), public layout (header, gradient bar, progress, sticky bottom bar), lazy admin, screens 1 (Inicio, open and closed) and 2 (Pases, mobile and desktop). Playwright with mocked APIs.

### PR 3 — `feat/176-03-competitions-and-data`

- [ ] T3 — Screens 3 (Competencias, skipped when none) and 4 (Tus datos, inline errors, optional fields block). Playwright.

### PR 4 — `feat/176-04-review-and-reserve`

- [ ] T4 — Screen 5 (Revisa y paga: summary, overlap notice, three legal checkboxes gating the button), create the registration (D1), temporary reserved screen, server error handling, public phone-width sweep and desktop check, docs (`docs/frontend-architecture.md`, env var). Playwright.

## Acceptance criteria

See issue #176. Evidence is recorded per task below.

## Progress

- 2026-10-08 — D1 answered. Design read (10 boards). Exploration done (delegated read-only explorer). Feature doc created. Next: T1.
- 2026-10-08 — T1 written (not committed yet): `entities/public-event` (credential-less catalog and registration client, readers, typed failures), `features/public-purchase` (pure purchase model) and `TextField`, `CheckboxField`, `FieldError`, `Notice` in `shared/ui`. RED observed (5 new test files failed on missing modules), then GREEN: 20 files, 180 tests. Lint, build and format check pass. The purchase model lives in a `features/` slice because it models the buyer's purchase action on top of the `public-event` entity; `formatMxn` stays in `@/entities/event-catalog` (features and pages may import it, so no move).

## Route per task

- T1 — delegated writer (writer trigger: new entity slice, pure model, shared components, tests). Files: `apps/frontend/src/entities/public-event/**`, `apps/frontend/src/features/public-purchase/**`, `apps/frontend/src/shared/ui/{text-field,checkbox-field,field-error}.tsx`, `shared/ui/index.ts`, `docs/frontend-architecture.md`.
