# CLAUDE.md

Guidance for AI coding agents working in this repository. Keep it short: link to the docs instead of copying them.

## Project

Event management for the "Los más pesados" breaking event (the repo name stays Nuestro Breaking). It is a pnpm monorepo:

- `apps/backend`: NestJS, Drizzle and PostgreSQL. Modules live under `src/` (`identity-access`, `events`, `database`).
- `apps/frontend`: Vite, React and Tailwind v4, organized with Feature-Sliced Design. See [docs/frontend-architecture.md](docs/frontend-architecture.md).
- `docs/`: ADRs, product plans, runbooks and contracts. [docs/code-quality.md](docs/code-quality.md) defines the quality rules.

## Commands

```bash
pnpm format                                       # Prettier for the whole workspace
pnpm verify:pr                                    # format + frontend lint, build, unit and e2e tests
pnpm --filter @nuestro-breaking/frontend test     # Vitest unit tests (pure logic, under 1s)
pnpm --filter @nuestro-breaking/frontend test:e2e # Playwright with mocked APIs
pnpm --filter @nuestro-breaking/backend lint
pnpm --filter @nuestro-breaking/backend test      # Jest unit tests
pnpm --filter @nuestro-breaking/backend test:e2e  # Jest + disposable PostgreSQL (needs Docker)
```

`verify:pr` does not run the backend; run the backend commands too when you change `apps/backend`.

## Tests: put each check in the cheapest layer

- **Pure logic** (formatting, parsing, validation, mapping, filtering): Vitest, in a `*.test.ts` file next to the module under `apps/frontend/src`.
- **User flows** (rendering, routing, interaction, accessibility, network handling): Playwright specs in `apps/frontend/e2e`. Keep one flow-level test per behavior, not every logic permutation.
- **Backend**: Jest unit specs in `src`, and PostgreSQL e2e specs in `apps/backend/test`.
- Write the failing test first when a deterministic test can express the behavior.

## CI

- Workflows live in `.github/workflows`. On PRs, only the changed area runs (backend or frontend). Docs-only PRs run just the format check. Pushes to `dev` run everything.
- On PRs, the accessibility and phone-width sweeps (`admin-accessibility`, `admin-phone-width`) are skipped. They run on every push to `dev`.
- The Playwright image tag in `pr-checks.yml` must match the `@playwright/test` version in `pnpm-lock.yaml`.

## Git and PRs

- Branches use a typed prefix (`feat/`, `fix/`, `ci/`, `docs/`, `test/`, ...) and target `dev`. Promotion goes `dev` → `staging` → `main`. Chained PRs may target their parent work branch (see README "Branch Flow").
- Use conventional commits, with granular commits per PR. Never add `Co-Authored-By` or AI attribution lines.
- Merge by rebasing onto `dev`, then creating a merge commit (semi-linear history). Merge chains bottom-up.
- Follow `.github/PULL_REQUEST_TEMPLATE.md`: link the issue, add exactly one `type:*` label, and include validation evidence.

## Conventions

- Code, comments, docs, tests and commit messages are in English. User-facing UI copy is in Spanish.
- Frontend: FSD layers import downward only. Code outside a slice imports through the slice's `index.ts`, with the `@/` alias. Parent-directory imports are not allowed.
- Frontend styling: Tailwind tokens (`--nb-*`) in both themes, 44px touch targets and at least 4.5:1 text contrast.
- Update the related docs in the same PR when behavior changes.
