# Admin polish before Mercado Pago

## Tracking

- Source: manual walkthrough by the product owner on 2026-10-08, before starting #177.
- Engram mirror: `odd/admin-polish/tasks`
- Branch: `fix/admin-polish` from `dev` at `ba19942`
- Delivery strategy: `single-pr` to `dev`. Forecast is about 350 authored lines.
- History: semi-linear. One conventional commit per task; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `ba19942`.

## Objective

Fix four admin UI defects found in the walkthrough, so the admin feels finished before the payment work starts.

## Scope

- In scope: the "Nuevo pase" layout, the overscroll background, sign-out navigation, and the check-in admit button size.
- Out of scope:
  - Grouping activities by discipline (Breaking, Popping, and so on). It needs a schema and API field. Planned as a post-MVP issue.
  - The "(canceled)" requests in DevTools. They come from React StrictMode in dev (mount, unmount, mount with AbortController cleanup) and do not happen in production.
  - Deduplicating `GET /admin/events`, which the shell, overview, check-in and `/admin` each fetch.

## Constraints

- FSD layers and `@/` slice-index imports (`docs/frontend-architecture.md`); Tailwind v4 with `--nb-*` tokens; Spanish UI copy; 44px targets; 4.5:1 contrast in both themes.
- Playwright mocked e2e for flows, Vitest for pure logic. Test-first where a deterministic RED is observable.

## Tasks

- [x] T1 — "Nuevo pase" uses two columns, like the pass detail screen: a "Datos del pase" card and an "Acceso a actividades" card, with one submit. Each activity uses a three-option segmented control (Sin acceso / Elegible / Incluida) instead of the chip dropdown. Each group (by activity kind) shows its counts and a "Marcar todas como elegibles" action. Stays one column on phones.
- [x] T2 — Overscroll past the end of any admin page shows the themed page background, not a flat dark band, in both themes.
- [ ] T3 — "Cerrar sesión" goes to `/admin`, so signing back in starts from the event entry instead of the previous screen.
- [ ] T4 — The check-in "Registrar entrada al evento" button uses the standard button size.

## Acceptance criteria

- T1: the create screen shows both cards side by side at desktop width and stacked at phone width. Creating a pass still saves its access map. Counts update when an access level changes.
- T2: html and body paint the same themed background as the shell, and overscroll does not reveal another color.
- T3: after sign-out the URL is `/admin`. Signing in lands on the event entry.
- T4: the admit button matches the other primary buttons.

## Checks

- `pnpm verify:pr` (format, frontend lint, build, unit and e2e tests).

## Progress

- T1 done (route: delegated writer). `groupCounts`, `groupSummary` and `markAllSelectable` in `pass-access-model.ts`, RED (3 failing Vitest cases) then GREEN (215 passed). `PassTypeForm` takes an `aside` card and lays both cards out in one form; access rows use a `radiogroup` segmented control on create and on the pass screen; the old chip legend is gone. E2E specs moved to `e2e/support/access.ts`; new flows cover side-by-side layout, phone stacking, counts and "Marcar todas como elegibles" (121 affected specs passed).
- T2 done (route: delegated writer). The legacy dark body gradient still serves the sign-in, not-found and dancer screens (cream text, no own background), so it stays; `html:has(.bg-page)` paints the themed `--nb-page` on html and clears body, and html/body get `overscroll-behavior: none`. RED: `e2e/page-background.spec.ts` failed in both themes (html background `none`); GREEN with `admin-fixed-shell` and `public-phone-width` (18 passed). The admin shell needed no change.
