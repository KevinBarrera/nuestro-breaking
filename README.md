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

Optional backend variables for the public API (see the [public event catalog contract](docs/contracts/public-event-catalog.md#cors)):

| Variable                   | Default | Meaning                                                                                            |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_ALLOWED_ORIGINS`   | empty   | Comma-separated exact origins allowed to call `/public/...` routes, besides `AUTH_TRUSTED_ORIGIN`. |
| `PUBLIC_RATE_LIMIT_LIMIT`  | `60`    | Public requests per client IP and route per window.                                                |
| `PUBLIC_RATE_LIMIT_TTL_MS` | `60000` | Public rate-limit window in milliseconds.                                                          |

Behind a reverse proxy, Express `trust proxy` must be configured for the rate limit to see real client IPs; see the contract's deployment note.

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

Optional frontend variables (read by Vite from `apps/frontend/.env` or the shell at dev and build time):

| Variable                 | Default                 | Meaning                                                                                                                            |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`      | `http://localhost:3000` | API origin.                                                                                                                        |
| `VITE_PUBLIC_EVENT_SLUG` | empty                   | Event shown at `/` (for example `los-mas-pesados-nov-2026`). Empty shows "No hay evento a la venta"; `/e/<slug>` works either way. |

The frontend is a Vite application organized with Feature-Sliced Design. See the [frontend architecture guide](docs/frontend-architecture.md) for setup, commands, routes, and import rules.

## Code Quality

See the [code quality guide](docs/code-quality.md) for workspace formatting, linting, import policy, and verification commands.

## Branch Flow

Work branches use a typed prefix (`feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`, ...) and target `dev`; `dev` promotes to `staging`, and `staging` to `main`. The `quality / branch-flow-guard` check enforces this. It runs in its own workflow (`.github/workflows/branch-flow-guard.yml`), so retargeting a PR re-runs the guard, and editing a PR title or description does not re-run the rest of the checks. The other PR checks run only for the area a PR changes (backend or frontend). A PR that touches only docs runs just `quality / format`; any other file outside `apps/` (lockfile, config, workflows, scripts), and every push to `dev`, runs everything. Retargeting does not re-run these checks, so after retargeting a chained PR, rebase and push before merging.

Chained (stacked) PRs are allowed: a typed work branch in this repository may target its parent typed work branch.

- Merge the chain bottom-up.
- With "Automatically delete head branches" enabled, deleting a merged parent branch makes GitHub retarget its child PRs to the parent PR's own base branch (to `dev` only when the parent targeted `dev`). Merging bottom-up therefore moves each next PR in the chain to `dev` in turn.
- If `dev` moves mid-chain and a parent is rebased, rebase each child onto the new parent with `git rebase --onto <new-parent> <old-parent-tip> <child>`.
