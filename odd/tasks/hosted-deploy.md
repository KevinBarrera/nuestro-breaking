# Hosted staging and production deploy — issue #238

Objective: the backend runs as a Docker image on Railway and the frontend as static files on Cloudflare, in staging and production, so online sales can open on 2026-10-19 (#182).
Branch: chained `feat/238-NN-*` from `dev` at `71d18ab`. Delivery: stacked PRs to `dev`, `Closes #238` on the last PR, no `Co-Authored-By`.
Test runner: backend Jest unit (`pnpm --filter @nuestro-breaking/backend test`) and PostgreSQL e2e (`test:e2e`, needs Docker); `docker build` for the image. Engram mirror: `odd/hosted-deploy/tasks`.

## Specs

- S1 — Issue scope: the backend serves real traffic behind Railway's proxy and, later, Cloudflare's proxy. Each client gets its own rate-limit bucket (today every client shares the proxy's IP: `public-rate-limit.ts:15-16`, no `trust proxy`), and the IP cannot be spoofed with a forged `X-Forwarded-For`.
- S2 — Issue scope: Railway's healthcheck has an endpoint that proves the process and the database are up.
- S3 — Issue scope: "migrations applied on every deploy." They run as a Railway pre-deploy command from the production image, without devDependencies (`drizzle-kit` and `ts-node` are devDependencies).
- S4 — Issue scope: "First administrator bootstrapped in each environment." `admin:bootstrap` runs from the production image (today it needs `ts-node`).
- S5 — ADR 0008: "the backend is a standard Docker image." Node 24.18.1, glibc base for `argon2`, the `drizzle/` folder included.
- S6 — Issue scope: the frontend is a single-page app on Cloudflare with a fallback to `index.html` (`createBrowserRouter`) and build-time `VITE_API_BASE_URL` / `VITE_PUBLIC_EVENT_SLUG`.
- S7 — Issue scope: "A deployment runbook in `docs/runbooks/`, and ADR 0008 updated if the DNS or hostname plan differs from it."

## Tasks

| ID  | Specs  | Route  | Status  | Evidence |
| --- | ------ | ------ | ------- | -------- |
| T1  | S1, S2 | writer | pending |          |
| T2  | S3, S4 | writer | pending |          |
| T3  | S5     | writer | pending |          |
| T4  | S6     | writer | pending |          |
| T5  | S7     | writer | pending |          |
| T6  | all    | user   | pending |          |

- T1 — Proxy-aware client IP (`TRUST_PROXY_HOPS`, Express `trust proxy` hop count, default 0 for local) and `GET /health` with a database ping, excluded from rate limiting. Swagger off when `NODE_ENV=production`.
- T2 — A compiled migration command (`drizzle-orm` migrator over `apps/backend/drizzle`) and a compiled `admin:bootstrap`, both runnable with plain `node` from `dist`.
- T3 — `Dockerfile` and `.dockerignore` for the backend; build and run locally against Docker PostgreSQL; healthcheck green.
- T4 — Cloudflare static assets config (Wrangler, `not_found_handling: single-page-application`) and documented build variables.
- T5 — `docs/runbooks/deploy.md` (Railway dashboard settings, variables, limits, pre-deploy, bootstrap; Cloudflare; DNS move), ADR 0008 amendment (subdomain hostnames, Workers static assets, Railway dashboard configuration because Config as Code is deprecated), admin-bootstrap runbook, `.env.example`.
- T6 — Provision staging in the dashboards with the user and verify the public purchase flow on provider URLs; admin sign-in and custom hostnames after the DNS move.

Risk: T1 (rate limiting and client identity on public endpoints), T2 (migrations against live databases). Each gets an independent verifier.

## Log

- L1 (user, 2026-10-14): "sí, si tengo cuentas en ambas" — starts #238 with the user's Railway and Cloudflare accounts.
- 2026-10-14: mapping. `HOST` defaults to `127.0.0.1` (`main.ts:21`, set `HOST=0.0.0.0` on Railway); no `trust proxy`; no health endpoint; Swagger always on at `api/doc`; migrations only via `drizzle-kit`; `admin:bootstrap` via `ts-node`; frontend API URL absolute and build-time; no Dockerfile or hosting config. Railway Config as Code (`railway.json`) is deprecated and stops being read on 2026-12-01; new services cannot use it, so Railway settings live in the dashboard and the runbook. Cloudflare Workers custom domains and the ADR's proxy in front of the backend both require the domain's nameservers on Cloudflare, so the organizer's domain must move its nameservers to Cloudflare (existing records imported and checked first).
