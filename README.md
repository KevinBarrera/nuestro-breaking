# Nuestro Breaking

pnpm workspace containing the frontend, backend API, and shared packages.

For project context, start with the [documentation guide](docs/README.md) or the [OpenSpec change guide](openspec/README.md). The November 2026 MVP proposal is a draft pending organizer validation, not an approved change to the existing plan.

## Prerequisites

- [NVM](https://github.com/nvm-sh/nvm)
- pnpm 11 or later
- Docker Compose

## Node.js runtime

NVM installs the exact Node.js version required by this repository. From the repository root, run these commands before any `pnpm` command:

```bash
nvm install
nvm use
```

## Install dependencies

After selecting the Node.js runtime, install dependencies from the repository root:

```bash
pnpm install
```

If pnpm reports ignored package build scripts, review and approve only the required packages with `pnpm approve-builds`, then install again.

## Setup acceptance check

After configuring `.env` and installing dependencies, verify the complete local setup with one command:

```bash
pnpm verify:setup
```

This check validates the pinned Node.js runtime, the existing pnpm workspace installation, PostgreSQL readiness, formatting, application checks, tests, and local frontend/backend routes. It starts PostgreSQL when necessary but leaves it running as persistent developer infrastructure. It never installs dependencies, writes the lockfile, prints environment values, or runs database migrations. See [setup verification](docs/setup-verification.md) for prerequisites, scope, and expected output.

## Environment and PostgreSQL

Copy `.env.example` to `.env` and replace the placeholder values. Keep `.env` local; it is ignored by Git.

Start PostgreSQL 16 from the repository root:

```bash
docker compose up -d postgres
docker compose ps
```

## Backend

Run the NestJS backend in watch mode:

```bash
pnpm dev:backend
```

The API listens on `http://localhost:3000`. OpenAPI documentation is available at [http://localhost:3000/api/doc](http://localhost:3000/api/doc).

## Database migrations

The Drizzle configuration reads the repository-root `.env`. `DATABASE_URL`, when set, takes precedence over the individual `POSTGRES_*` variables.

`pnpm verify:setup` intentionally does not generate or apply migrations. Run migration commands only when you intend to change the database schema.

Generate a migration after changing the schema:

```bash
pnpm --filter @nuestro-breaking/backend db:generate
```

Apply pending migrations only when you intend to change the database schema:

```bash
pnpm --filter @nuestro-breaking/backend db:migrate
```

Initial migration artifacts are committed under `apps/backend/drizzle`.

## Frontend

Run the React frontend in development mode:

```bash
pnpm dev:frontend
```

The frontend is a Vite application organized with Feature-Sliced Design. See the [frontend architecture guide](docs/frontend-architecture.md) for setup, commands, routes, and import rules.

## Code Quality

See the [code quality guide](docs/code-quality.md) for workspace formatting, linting, import policy, and verification commands.

## Branch Flow

Work branches use a typed prefix (`feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`, ...) and target `dev`; `dev` promotes to `staging`, and `staging` to `main`. The `quality / branch-flow-guard` check enforces this.

Chained (stacked) PRs are allowed: a typed work branch in this repository may target its parent typed work branch.

- Merge the chain bottom-up.
- With "Automatically delete head branches" enabled, deleting a merged parent branch makes GitHub retarget its child PRs to the parent PR's own base branch (to `dev` only when the parent targeted `dev`). Merging bottom-up therefore moves each next PR in the chain to `dev` in turn.
- If `dev` moves mid-chain and a parent is rebased, rebase each child onto the new parent with `git rebase --onto <new-parent> <old-parent-tip> <child>`.
