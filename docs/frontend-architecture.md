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
```

## FSD Layers

- `app/` contains application bootstrap, global styles, providers, and router wiring.
- `pages/` contains route-level screens. The current slices are `admin`, `dancer`, and `not-found`.
- `widgets/` is reserved for reusable page-level compositions when they are needed.
- `features/` is reserved for user-facing business actions. It does not exist until an actual action is implemented.
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
