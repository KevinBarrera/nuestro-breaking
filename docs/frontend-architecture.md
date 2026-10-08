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
pnpm --filter @nuestro-breaking/frontend test
pnpm --filter @nuestro-breaking/frontend test:e2e
```

Pure logic (formatting, parsing, response readers, view models) is unit-tested with Vitest: `test` runs `src/**/*.test.ts` in Node in milliseconds. Colocate each `*.test.ts` next to its module and import it with a same-directory path. `vitest.config.ts` merges `vite.config.ts`, so the `@` alias and plugins match the app; the app's `tsc -b` typechecks the tests and ESLint lints them. Pass time zones explicitly and use fixed dates, so results never depend on the machine's clock or zone. Playwright specs cover user flows: rendering, accessibility, routing, network handling and interaction. When a spec starts enumerating input permutations, move them to a unit test and keep one flow-level assertion in the spec.

Playwright specs in `apps/frontend/e2e` are typechecked: `tsconfig.node.json` includes `e2e` and `playwright.config.ts`, so `build` (`tsc -b`) fails on type errors in specs and ESLint lints them with type information. Specs mock the API with `page.route`; `e2e/support/` holds shared mocks for sweeps across every admin screen.

CI runs the mocked suite inside the official `mcr.microsoft.com/playwright:v<version>-noble` image, which ships the browsers, split into two shards (`test:e2e --shard=<n>/2`) behind the aggregated `frontend / playwright` check. The shards set `NB_E2E_PREVIEW=1`, so Playwright serves a production build (`vite build` + `vite preview`) instead of the on-demand dev server, so specs cannot load `/src/...` modules in the browser; test pure modules with Vitest instead. On pull requests the shards also set `NB_E2E_SKIP_SWEEPS=1`, which skips the theme × screen sweeps (`admin-accessibility.spec.ts`, `admin-phone-width.spec.ts`); every push to `dev` runs them, and feature specs keep their own phone-width checks on PRs. Run them locally with plain `test:e2e`. The one dev-server-only assertion (session store cleared on sign-out) runs again without preview in shard 1. The live check-in job stays on the host runner because its backend starts PostgreSQL with Testcontainers, which needs the host Docker daemon. The image tag in `.github/workflows/pr-checks.yml` must match the exact `@playwright/test` version in `pnpm-lock.yaml`; bump both together.

On pull requests, a `quality / changes` job decides which areas run: backend jobs run only when `apps/backend/**` changes, frontend lint, unit tests, build and Playwright only when `apps/frontend/**` changes, and the live check-in job when either changes. Docs-only files (`docs/**`, `odd/**`, `openspec/**`, `*.md`) run no area. Any other file outside the two apps (lockfile, workspace or tool config, workflows, scripts) and every push to `dev` run everything; `quality / format` always runs. If change detection fails, every area runs instead of being skipped. Skipped shards still let `frontend / playwright` pass, so the check name stays stable.

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
  - The event overview (`/admin/events/:eventId`, "Resumen") shows quick actions, a "Venta en línea" section, the catalog counts and the passes on sale. "Venta en línea" loads on its own from `GET /admin/events/:eventId/sales` (client in `entities/event-sales`), so a sales failure shows a plain message with "Reintentar" and never hides the catalog. It shows the state ("Abierta" or "Cerrada" with its reason), the public address `/e/<slug>` read-only, and a form with the switch, optional opening and closing `datetime-local` fields (each with "Quitar") and one "Guardar" that sends the full `PUT`. Dates use the event time zone from the foundation, as the activity form does; without it they use the browser zone and say so. The window is checked client-side (closing after opening) and a server 400 shows a safe notice. See [Event sales contract](contracts/event-sales.md#admin-ui).
  - Pases has its own routes: `/admin/events/:eventId/passes` (the active cards, each a link to its pass, plus "Nuevo pase", and an "Archivados" section, shown only when a pass is archived, whose cards show name, class, price and an "Archivado" badge with a "Restaurar" button), `/passes/new` (create) and `/passes/:passTypeId` (edit and access). A layout route loads the catalog once for all three and keeps write notices across them: a create lands on the new pass, an archive returns to the list with its notice. An unknown or archived pass id shows a not-found state linking back to Pases; for an archived pass its copy points to the "Archivados" section, where it can be restored. Access to activities is a vertical list for that one pass, grouped by activity kind (start time, then name, within a kind), with "Sin acceso / Elegible / Incluida" per activity: on create it goes out with the single `POST`, and on the pass screen "Guardar acceso" replaces the list with the `PUT` and its expected version. Every pass save goes through "Revisar cambios" first: the create review lists every field against "—" plus each activity it gives access to, a field edit lists the changed fields (class label, price in pesos, required class), and an access edit lists one row per changed activity ("Sin acceso → Incluida", including a link to an archived activity that the save drops). Fields ("Guardar cambios") and access ("Guardar acceso") keep separate saves, each with its own review and a single write, so the version chain stays simple and no save is half-applied; each confirmed response is applied in place, so the next save sends the new version, and a field save keeps unsaved access edits. An unchanged form or list is not submitted: its button stays focusable and shows "No hay cambios para guardar.". Archiving asks in a destructive `ConfirmDialog` ("Ya no se podrá asignar a nuevas inscripciones."). Restoring asks in a default-tone `ConfirmDialog` ("Volverá a estar activo con los mismos accesos que tenía y se podrá asignar de nuevo."), posts the restore with the expected version, applies the restored pass in place (it moves to the main list) and focuses its card link, or the heading when it is not shown. A restore 409 cannot tell its causes apart, so its alert (with "Recargar") says an active pass may already use the name (rename one of the two) or someone else changed it. A 409 stays visible: the field save shows the page alert with "Recargar", and the access save shows the conflict alert in the access list. The create and pass screens use `UnsavedChangesGuard` while they hold unsaved field or access edits. The former `/pass-types` address redirects (replace navigation) to `/passes`, and the side navigation keeps Pases current on every sub-route.
- `/dancer` is the dancer route area.
- `*` renders a not-found page with links to the two current areas.

The router is a data router (`createBrowserRouter` with `RouterProvider`, in `app/router`), so screens can use data-router APIs such as `useBlocker`. Route paths live in `@/shared/config` `routes`.

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

## Shared Dialogs

`@/shared/ui` also exports dialog primitives built on React Aria's `ModalOverlay`, `Modal` and `Dialog`. Focus stays inside the open dialog, Esc closes it, and focus returns to the control that opened it. Dialogs fit a 375px screen, and a tall body scrolls while the title and buttons stay visible.

- **`Modal`.** The base dialog. It needs a `title` (the accessible name) and takes an optional `description`, body `children` and `actions` (or a function that receives `close`). Use it inside `DialogTrigger` (also exported) or control it with `isOpen`/`onOpenChange`. Clicking the backdrop does not close it unless `isDismissable` is set.
- **`ConfirmDialog`.** A controlled `alertdialog` for actions with consequences, such as archiving: `title`, `consequence`, `confirmLabel`, `cancelLabel` ("Cancelar" by default), `tone="destructive"` for a filled danger button, and `isPending` (with an optional `pendingLabel`), which disables both buttons and Esc while the action runs. The caller closes it once the action succeeds. When the action removes the control that opened it (an archived activity loses its "Archivar" button), the caller moves focus to a stable target: after an archive the activities page focuses its heading, under which the success notice is announced, and after a restore (default tone, "Restaurar" on an archived row) it focuses the restored row's "Editar", or the heading when that row is not shown. The pass list does the same after a pass restore, focusing the restored card's link.
- **`ReviewChangesDialog`.** A controlled "Revisar cambios" dialog for edit forms. It lists each changed field as label and before → after, with "Guardar cambios" and "Volver a editar" (which closes it and keeps the form's edits), plus `isPending`. Build its `rows` with `changedRows(fields)`, and use `hasChanges(fields)` to skip the review when nothing changed. Both compare displayed values, so pass a `format` (for example for prices) when two stored values display the same. Text is not trimmed.
- **`UnsavedChangesGuard`.** Render `<UnsavedChangesGuard when={dirty && !saving} />` on a screen with unsaved edits. While `when` is true, in-app navigation to another path (links, breadcrumbs, the side navigation, back and forward) is held with the data router's `useBlocker` and confirmed in a destructive `ConfirmDialog` ("¿Salir sin guardar?", "Salir sin guardar" / "Seguir editando"), and a reload or tab close gets the browser's own prompt through `beforeunload`. Turn it off while a save is in flight, so the navigation that follows a successful save (create → detail, archive → list) is never blocked; once the confirmed save is applied the screen is clean again.
- **`buttonClass(tone)`.** Shared button classes (`primary`, `secondary`, `danger`, `destructive`) with 44px targets, for shared UI that cannot import page styles.

## Shared Breadcrumbs

`Breadcrumbs` from `@/shared/ui` marks where a nested screen sits (for example "Pases › Pase completo"). Its `items` of `{ label, to? }` render a `nav` named "Ruta de navegación" with an ordered list: earlier items are links with 44px targets, and the last item carries `aria-current="page"`. The "›" separator is generated by CSS, so it stays out of the item names, and long labels wrap at 375px.

## Admin Shell

`@/widgets/admin-shell` (`AdminShell`) wraps every protected `/admin` page through `AdminSessionBoundary`. It renders the header (brand, event selector from `GET /admin/events`, theme toggle, sign-out), the brand bar, and the full-height side navigation with Operación and Catálogo groups. Screens without a backend (Inscripciones, Listas de respaldo) are shown disabled with "Próximamente". Pages render only their own `<main>`.

- **Fixed frame.** From `md` up the shell is one viewport tall (`h-dvh`): the header, brand bar and side navigation stay in place, and only the content column around the page's `<main>` scrolls (`overflow-y-auto`); the side navigation scrolls on its own if it outgrows the height. The shell scrolls that column back to the top on every route change, because the window no longer scrolls. Popovers such as the shared `Select` listbox render at the end of `<body>`, so the scroll container never clips them.
- **Phone.** Below `md` the navigation stacks above the page content and the whole page scrolls naturally with no horizontal overflow. `e2e/admin-fixed-shell.spec.ts` covers both layouts.
