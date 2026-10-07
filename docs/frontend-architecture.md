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
  - `/admin` itself is the event picker, built only from `GET /admin/events`: a card per event (its name, "Abrir evento" to the overview, and Check-in, Actividades and Pases links), with loading, error (with "Reintentar"), access-denied and empty states. With exactly one event it redirects (replace navigation) to that event's overview. It shows no sample or planning data.
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
- **Selected chips.** Filter chips are transparent with a border when unselected; the selected chip uses `bg-chip-selected text-chip-selected-fg` (`--nb-chip-selected-*`: indigo on cream text in light, cream with indigo text in dark), so it differs in lightness, not only hue, and shows the shared `CheckIcon` from `@/shared/ui`. `e2e/admin-accessibility.spec.ts` checks both chip states for 4.5:1 text and at least 3:1 between their backgrounds in both themes.
- **Preference.** `@/shared/lib` (`theme.ts`) reads and writes the `nb-theme` key in `localStorage` with guards: any storage failure falls back to light without throwing. `@/features/theme-toggle` renders an icon-only 44×44 button whose name states the action: a moon named "Cambiar a tema oscuro" in the light theme and a sun named "Cambiar a tema claro" in the dark theme (no `aria-pressed`; a matching `title` shows on hover).
- **No flash.** An inline script in `index.html` sets `data-theme` on `<html>` before first paint; keep its key in sync with `theme.ts`.
- **Fonts.** Archivo (UI) and IBM Plex Mono (prices, times, folios: `font-mono`) load from Google Fonts through a non-blocking `rel="preload"` that swaps to a stylesheet on load, with a `<noscript>` fallback. `--font-sans` and `--font-mono` end in system fonts, so the UI stays usable when the font host fails. Playwright blocks the font hosts by DNS so specs stay offline.

## Shared Select

`@/shared/ui` exports `Select`, built on React Aria Components (`react-aria-components`, the only third-party UI dependency). Admin screens use it instead of native `<select>` elements so the trigger and the open listbox follow the theme tokens.

- **API.** `label`, `options` (`{ id, label, isDisabled? }`), `selectedKey`, `onSelectionChange(key)`, optional `name`, `isDisabled`, `placeholder`, `hideLabel` (screen-reader-only label), `variant` (`field` for forms, `header` for the topbar, `chip` for table cells) and `triggerClassName` (for example a chip tone). Keys are non-empty strings; map an empty value such as "Ninguno" to an explicit key. Re-choosing the current option does not call `onSelectionChange`.
- **Accessibility.** The trigger is a `button` with `aria-haspopup="listbox"` whose name is the selected value followed by the label (for example "Encuentro del barrio Evento"). Enter, Space or the arrow keys open the listbox with focus on the selected option, which is marked `aria-selected` and shows a check icon. Options are at least 44px tall.
- **Hidden native select.** React Aria renders an `aria-hidden`, untabbable native `<select>` beside the trigger for autofill and `FormData`; specs ignore it (`e2e/support/select.ts`) and must not interact with it.
- **Specs.** Use `selectTrigger`, `chooseOption` and `expectSelected` from `e2e/support/select.ts`; the listbox renders in a popover at the end of `<body>`, outside the trigger's form or region.

## Admin Shell

`@/widgets/admin-shell` (`AdminShell`) wraps every protected `/admin` page through `AdminSessionBoundary`. It renders the header (brand, event selector from `GET /admin/events`, theme toggle, sign-out), the brand bar, and the full-height side navigation with Operación and Catálogo groups. Screens without a backend (Inscripciones, Listas de respaldo) are shown disabled with "Próximamente". Pages render only their own `<main>`.

- **Fixed frame.** From `md` up the shell is one viewport tall (`h-dvh`): the header, brand bar and side navigation stay in place, and only the content column around the page's `<main>` scrolls (`overflow-y-auto`); the side navigation scrolls on its own if it outgrows the height. The shell scrolls that column back to the top on every route change, because the window no longer scrolls. Popovers such as the shared `Select` listbox render at the end of `<body>`, so the scroll container never clips them.
- **Phone.** Below `md` the navigation stacks above the page content and the whole page scrolls naturally with no horizontal overflow. `e2e/admin-fixed-shell.spec.ts` covers both layouts.
