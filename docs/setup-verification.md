# Setup Verification

`pnpm verify:setup` is the one-command acceptance check for a live local workspace. Run it after selecting the pinned Node.js version, installing dependencies, and creating a local `.env` from `.env.example`.

## Quick Path

```bash
nvm install
nvm use
pnpm install
pnpm verify:setup
```

A successful run ends with `Setup verification passed.` The runner writes progress and command output to the terminal only. It creates no runner-specific files.

## Prerequisites

- NVM with Node.js `24.18.1` available.
- pnpm 11 or later available on `PATH`.
- Docker Desktop or another Docker installation with Docker Compose available.
- A repository-root `.env` configured from `.env.example`. Environment values are never displayed by the runner.
- Chromium installed for Playwright. Install it once with `pnpm --filter @nuestro-breaking/frontend exec playwright install chromium` when the frontend E2E check reports that it is missing.

## Verification Contract

| Area                  | Check                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | The current Node.js version exactly matches `.nvmrc`.                                                                     |
| Workspace             | pnpm is available and can inspect the existing workspace without installing or changing dependencies or the lockfile.     |
| Database              | The existing `docker compose` PostgreSQL service is reused, or `postgres` is started and polled with `pg_isready`.        |
| Quality               | `pnpm format:check`, frontend lint/build, and backend lint/build run through their existing scripts.                      |
| Tests                 | Backend unit tests, backend E2E tests, and frontend Playwright E2E tests run through their existing scripts.              |
| Backend reachability  | The runner reuses a healthy service on `127.0.0.1:3000` or starts one there, then checks `http://127.0.0.1:3000/api/doc`. |
| Frontend reachability | The runner reuses a healthy Vite service on `127.0.0.1:5173` or starts one there, then checks `/admin` and `/dancer`.     |

The runner uses bounded readiness retries and timeouts. If an intended web port is occupied by an unhealthy or unrelated process, it fails rather than replacing that process. Services launched by the runner are stopped on success, failure, `SIGINT`, or `SIGTERM`; services it reuses are left untouched.

## Persistent Database Behavior

PostgreSQL is developer infrastructure, not a temporary test process. The verification command starts `docker compose` service `postgres` only when it is not already running, and it never stops that service. It checks readiness only.

Database migrations are intentionally **not** run by setup verification. The command does not run `db:generate` or `db:migrate`, and it does not apply schema or data changes. Use the explicit migration commands in the [repository README](../README.md#database-migrations) when a schema change is intended.

## Intentionally Excluded Commands

The check is non-mutating with respect to source, dependencies, lockfiles, and database schema/data. It intentionally does not run:

- `pnpm install` or `pnpm approve-builds`
- `pnpm format`
- `pnpm --filter @nuestro-breaking/backend db:generate`
- `pnpm --filter @nuestro-breaking/backend db:migrate`
- `docker compose down`

Run `pnpm format` before verification when source formatting needs to be applied. The acceptance check then confirms the result with `format:check`.
