# Frontend

React 19, Vite, TypeScript, Tailwind CSS, Zustand, and React Router application.

From the repository root, select the pinned runtime and install dependencies:

```bash
nvm install
nvm use
pnpm install
```

Run frontend commands from the repository root:

```bash
pnpm dev:frontend
pnpm --filter @nuestro-breaking/frontend lint
pnpm --filter @nuestro-breaking/frontend build
```

## End-to-end tests

Install the Chromium browser once after installing dependencies:

```bash
pnpm --filter @nuestro-breaking/frontend exec playwright install chromium
```

Run the Chromium E2E suite or open Playwright's UI mode:

```bash
pnpm --filter @nuestro-breaking/frontend test:e2e
pnpm --filter @nuestro-breaking/frontend test:e2e:ui
```

The suite starts a local Vite server only for E2E execution and covers public browser behavior. Unit and component tests are future work; they are separate from browser E2E tests. See the [frontend architecture guide](../../docs/frontend-architecture.md) for route areas and FSD boundaries, and the [code quality guide](../../docs/code-quality.md) for workspace verification.
