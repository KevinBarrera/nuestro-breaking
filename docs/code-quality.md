# Code Quality

The workspace uses Prettier for formatting and ESLint for correctness, type safety, and dependency boundaries. Use the pinned Node.js version before every command.

## Quick Path

```bash
nvm install
nvm use
pnpm format
pnpm format:check
pnpm --filter @nuestro-breaking/frontend lint
pnpm --filter @nuestro-breaking/frontend build
pnpm --filter @nuestro-breaking/frontend test
pnpm --filter @nuestro-breaking/backend lint
pnpm --filter @nuestro-breaking/backend build
pnpm --filter @nuestro-breaking/backend test
```

## Tool Responsibilities

| Tool                     | Responsibility                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Prettier                 | The sole formatter for application code, configuration, and Markdown.                 |
| ESLint                   | Correctness, TypeScript type-aware safety checks, React rules, and import boundaries. |
| `eslint-config-prettier` | Disables ESLint formatting rules so Prettier is authoritative.                        |

The root `format` command writes supported files across the workspace. `format:check` is its non-mutating verification counterpart. Generated output, dependencies, environment files, migrations, and lockfiles are excluded by `.prettierignore`.

## Import Policy

Each application owns `@/`, which resolves to that application's `src/` directory.

```ts
import { AppModule } from '@/app.module';
import { PageShell } from '@/shared/ui';
import { localHelper } from './local-helper';
```

- Do not use parent-directory imports such as `../feature`.
- Same-directory `./` imports are allowed.
- Import code from another workspace through its published package name, never through that application's `@/` alias or a relative traversal.
- Add package exports and a workspace dependency before sharing code across applications.

The backend compiles aliases with Nest, then `tsc-alias` rewrites emitted JavaScript to relative paths. This makes `node dist/main` resolve production imports without a TypeScript-only runtime hook. Jest maps `@/` to backend `src/` for both unit and end-to-end test configurations.

## Frontend Boundaries

The frontend keeps its Feature-Sliced Design restrictions. Dependencies point downward from `app` to `shared`; cross-slice imports use public `index.ts` APIs, and deep alias imports remain blocked. The parent-import rule is additive: use `./` within local structure or a slice public API rather than traversing upward.

## Applied Standards

Both applications use `typescript-eslint`'s `recommendedTypeChecked` configuration with `projectService`, following the current TypeScript ESLint guidance for type-aware linting. The frontend also retains `eslint-plugin-react-hooks` and Vite's React Refresh checks. The backend retains Node and Jest environments while using the same type-aware baseline; Jest globals are scoped only to test files.

No lint rule runs Prettier. No TypeScript safety rule is blanket-disabled; exceptions must be scoped to a framework or test need and documented in the ESLint configuration.
