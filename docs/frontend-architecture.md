# Frontend Architecture

The frontend lives in `apps/frontend` and uses Feature-Sliced Design (FSD). It is a React + TypeScript Vite application with Tailwind CSS, Zustand, and React Router.

## Setup And Commands

Use the repository Node.js version before every project command:

```bash
nvm install
nvm use
pnpm install
```

Run the frontend from the repository root:

```bash
pnpm --filter @nuestro-breaking/frontend dev
pnpm --filter @nuestro-breaking/frontend lint
pnpm --filter @nuestro-breaking/frontend build
pnpm --filter @nuestro-breaking/frontend test:e2e
```

Playwright specs in `apps/frontend/e2e` are typechecked: `tsconfig.node.json` includes `e2e` and `playwright.config.ts`, so `build` (`tsc -b`) fails on type errors in specs and ESLint lints them with type information. Specs mock the API with `page.route`; `e2e/support/` holds shared mocks for sweeps across every admin screen.

## FSD Layers

- `app/` contains application bootstrap, global styles, providers, and router wiring.
- `pages/` contains route-level screens. The current slices are `admin`, `dancer`, and `not-found`.
- `widgets/` contains reusable page-level compositions. `widgets/admin-shell` is the admin frame (see [Admin Shell](#admin-shell)).
- `features/` contains user-facing actions. `features/theme-toggle` is the light/dark switch.
- `entities/` contains business models. `entities/session` defines the typed user role and session model; `judge` is an admin-capable role.
- `shared/` contains framework-agnostic configuration, general utilities, and reusable UI primitives.

Dependencies point downward: `app -> pages -> widgets -> features -> entities -> shared`. A layer can only import from layers to its right. Code outside a slice must use that slice's `index.ts` public API. Internal imports may use `./`; parent-directory imports are prohibited workspace-wide.

## Import Enforcement

`apps/frontend/eslint.config.js` uses ESLint's `no-restricted-imports` rule to enforce layer direction and block deep alias imports. For example, use `@/entities/session` rather than `@/entities/session/model/types`, and use `@/features/check-in` rather than internal feature paths when a future feature slice is added.

The rule applies to future `features` and `widgets` directories as well. A slice imports its own internal files with `./`, which keeps its public API explicit and prevents cross-feature deep imports.

## Route Areas

- `/admin` is the administration route area. Admins and judges belong here in the initial scope.
- `/dancer` is the dancer route area.
- `*` renders a not-found page with links to the two current areas.

`AdminSessionBoundary` protects the `/admin` route area by checking the backend-reported server session and rendering the minimal sign-in state when admin access is unavailable. `RoleAreaBoundary` remains available for route areas that do not yet enforce access; it must not create mock authentication.

## Workspace Reuse

Keep code in `apps/frontend` until there is demonstrated reuse. Create a workspace package only when a UI primitive or API layer has a real shared consumer or requires an independent lifecycle. Do not extract packages preemptively.

## Theme System

The admin UI has a light and a dark theme built on CSS custom properties in `src/app/styles/index.css`.

- **Tokens.** Each theme defines semantic `--nb-*` properties (`--nb-surface`, `--nb-fg`, `--nb-muted`, `--nb-line`, `--nb-success-bg`, ...) under `:root[data-theme='light']` and `:root[data-theme='dark']`. Pages inside the admin shell never reference the raw event palette (`--event-*`) directly; the sign-in screen in `AdminSessionBoundary` keeps its own fixed dark palette.
- **Utilities.** `@theme inline` maps tokens to Tailwind colors, so `bg-surface`, `text-muted`, `border-line`, `bg-primary text-primary-fg`, `bg-success text-success-fg`, `bg-chip` and friends follow the active theme. `bg-page` and `bg-brand-bar` are custom utilities for the gradients.
- **Rule.** Admin UI uses only these theme utilities, never raw hex values or default Tailwind palette colors, so both themes stay correct. Text pairs must keep 4.5:1 contrast and controls a 44px minimum height; `e2e/admin-accessibility.spec.ts` checks both and `e2e/admin-phone-width.spec.ts` checks every admin screen at 375px in both themes.
- **Preference.** `@/shared/lib` (`theme.ts`) reads and writes the `nb-theme` key in `localStorage` with guards: any storage failure falls back to light without throwing. `@/features/theme-toggle` renders the `aria-pressed` "Tema oscuro" button.
- **No flash.** An inline script in `index.html` sets `data-theme` on `<html>` before first paint; keep its key in sync with `theme.ts`.
- **Fonts.** Archivo (UI) and IBM Plex Mono (prices, times, folios: `font-mono`) load from Google Fonts through a non-blocking `rel="preload"` that swaps to a stylesheet on load, with a `<noscript>` fallback. `--font-sans` and `--font-mono` end in system fonts, so the UI stays usable when the font host fails. Playwright blocks the font hosts by DNS so specs stay offline.

## Admin Shell

`@/widgets/admin-shell` (`AdminShell`) wraps every protected `/admin` page through `AdminSessionBoundary`. It renders the header (brand, event selector from `GET /admin/events`, theme toggle, sign-out), the brand bar, and the full-height side navigation with Operación and Catálogo groups. Screens without a backend (Inscripciones, Listas de respaldo) are shown disabled with "Próximamente". Below the `md` breakpoint the navigation stacks above the page content. Pages render only their own `<main>`.
