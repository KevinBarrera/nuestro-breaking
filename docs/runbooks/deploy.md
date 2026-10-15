# Deploy Runbook

This guide sets up and deploys the hosted staging and production environments
([#238](https://github.com/KevinBarrera/nuestro-breaking/issues/238),
[ADR 0008](../adr/0008-hosting-platform.md)): the backend and PostgreSQL on
Railway, the frontend on Cloudflare, and DNS on Cloudflare. Settings live in
the provider dashboards; this page is the record of what to set.

| Environment | Git branch | Frontend (Cloudflare Worker)                                   | Backend (Railway)                  |
| ----------- | ---------- | -------------------------------------------------------------- | ---------------------------------- |
| Staging     | `staging`  | `staging.losmaspesados.com.mx` (`los-mas-pesados-web-staging`) | `staging-api.losmaspesados.com.mx` |
| Production  | `main`     | `boletos.losmaspesados.com.mx` (`los-mas-pesados-web`)         | `api.losmaspesados.com.mx`         |

The admin panel lives on the same frontend host, under `/admin`. Every name
stays one level below `losmaspesados.com.mx`, so Cloudflare's free certificate
covers it, and frontend and backend share one site, as the admin session
cookie requires.

## Quick path

Do staging first, end to end, then repeat for production.

1. [Railway](#railway): project, PostgreSQL, backend service, variables. The
   first deploy runs the migrations.
2. [Cloudflare Workers](#cloudflare-workers): connect the repository and set
   the build variables.
3. [DNS](#dns-move-to-cloudflare): move the domain's nameservers to
   Cloudflare, then add the custom domains.
4. [First administrator](#first-administrator): run the bootstrap once.
5. [Verify](#verify-an-environment): the checklist at the end of this page.

Before step 3 the services answer only on provider URLs (`*.up.railway.app`,
`*.workers.dev`). They are different sites, so admin sign-in does not work
there yet; the public pages and `/health` do.

## Railway

### Project and database

1. Create one project with two environments, `staging` and `production`.
2. In each environment, add a PostgreSQL service.
3. Set the cost controls from ADR 0008 before exposing anything: a workspace
   hard usage limit with a lower soft limit, and CPU and memory limits on every
   service (staging lower than production). The amounts stay in the dashboard,
   not in this repository.

### Backend service

Add a service from this GitHub repository in each environment. Railway's
Config as Code (`railway.json`) is deprecated, so set everything in the
service settings:

| Setting            | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Source branch      | `staging` or `main` (table above)                                                        |
| Root directory     | Empty (repository root; the image builds from it)                                        |
| Dockerfile         | Variable `RAILWAY_DOCKERFILE_PATH=apps/backend/Dockerfile`                               |
| Watch paths        | `apps/backend/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`               |
| Pre-deploy command | `node dist/scripts/migrate-database.js`                                                  |
| Start command      | Empty (the image runs `node dist/src/main.js`)                                           |
| Healthcheck path   | `/health`                                                                                |
| Public networking  | Generate a Railway domain for the first checks; add the custom domain after the DNS move |

How these behave:

- The **pre-deploy command** runs in the new image, with the service variables
  and the private network, before traffic switches. It applies pending
  migrations once, even if two deploys overlap. If it fails, the deploy stops
  and the previous version keeps serving; the log shows one line such as
  `Database migration failed: [42P07] relation "users" already exists`.
- The **healthcheck** gates each deploy: traffic switches only after `/health`
  answers `200` (default timeout 300 seconds). It runs at deploy time only;
  Railway does not keep polling it afterwards.
- The image listens on the `PORT` Railway injects, on `0.0.0.0`.

### Backend variables

Set these in each environment's backend service. Values marked _secret_ come
from the provider and are never committed.

| Variable                        | Staging                                                                         | Production                                                              |
| ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `RAILWAY_DOCKERFILE_PATH`       | `apps/backend/Dockerfile`                                                       | same                                                                    |
| `DATABASE_URL`                  | `${{Postgres.DATABASE_URL}}` (private network, no egress cost)                  | same                                                                    |
| `AUTH_TRUSTED_ORIGIN`           | `https://staging.losmaspesados.com.mx`                                          | `https://boletos.losmaspesados.com.mx`                                  |
| `PUBLIC_APP_URL`                | `https://staging.losmaspesados.com.mx`                                          | `https://boletos.losmaspesados.com.mx`                                  |
| `PUBLIC_ALLOWED_ORIGINS`        | Empty (the admin origin is already allowed)                                     | Empty                                                                   |
| `TRUST_PROXY_HOPS`              | `1` before the DNS move, `2` after (see [Client IP check](#client-ip-check))    | same                                                                    |
| `BREVO_API_KEY`                 | _secret_ ([email runbook](email-delivery.md))                                   | _secret_                                                                |
| `EMAIL_SENDER_ADDRESS`          | Verified sender in Brevo                                                        | same                                                                    |
| `EMAIL_SENDER_NAME`             | `Los más pesados`                                                               | same                                                                    |
| `EMAIL_SANDBOX`                 | `true` (Brevo validates, never delivers)                                        | Unset (defaults to `false` in production)                               |
| `MERCADO_PAGO_MODE`             | `sandbox`                                                                       | `production`, only after the staging demo with the organizer            |
| `MERCADO_PAGO_ACCESS_TOKEN`     | _secret_, test account ([sandbox runbook](mercado-pago-sandbox.md))             | _secret_, organizer's account (a `TEST-` token is refused)              |
| `MERCADO_PAGO_WEBHOOK_SECRET`   | _secret_                                                                        | _secret_                                                                |
| `MERCADO_PAGO_NOTIFICATION_URL` | `https://staging-api.losmaspesados.com.mx/public/payments/mercado-pago/webhook` | `https://api.losmaspesados.com.mx/public/payments/mercado-pago/webhook` |

Do not set `LOCAL_ADMIN_PROVISIONING`, `LOCAL_ADMIN_PASSWORD` or
`LOCAL_CATALOG_SEED`: they are for local databases only. Optional tuning
variables keep their defaults (`PUBLIC_RATE_LIMIT_LIMIT`,
`PUBLIC_RATE_LIMIT_TTL_MS`, `EMAIL_DISPATCH_INTERVAL_MS`,
`PENDING_EXPIRY_SWEEP_INTERVAL_MS`, `PENDING_PAYMENT_HOURS`).

The image sets `NODE_ENV=production`, so the API docs are off and the backend
refuses to start when a required variable is missing or malformed. The deploy
log names the variable, never its value.

## Cloudflare Workers

`apps/frontend/wrangler.jsonc` defines both Workers: static files only, and
unknown paths return `index.html` so page reloads and deep links reach the
React router. Create one Worker per environment from **Workers & Pages >
Create > Import a repository**:

| Setting           | Staging                                        | Production                             |
| ----------------- | ---------------------------------------------- | -------------------------------------- |
| Worker name       | `los-mas-pesados-web-staging`                  | `los-mas-pesados-web`                  |
| Git branch        | `staging`                                      | `main`                                 |
| Root directory    | `apps/frontend`                                | `apps/frontend`                        |
| Build command     | `pnpm install --frozen-lockfile && pnpm build` | same                                   |
| Deploy command    | `npx wrangler@4.144.0 deploy --env=staging`    | `npx wrangler@4.144.0 deploy --env=""` |
| Build watch paths | `apps/frontend/*`, `pnpm-lock.yaml`            | same                                   |

Build variables (**Settings > Build > Variables and secrets**, not the runtime
variables; Vite copies them into the files at build time):

| Variable                 | Staging                                    | Production                         |
| ------------------------ | ------------------------------------------ | ---------------------------------- |
| `VITE_API_BASE_URL`      | `https://staging-api.losmaspesados.com.mx` | `https://api.losmaspesados.com.mx` |
| `VITE_PUBLIC_EVENT_SLUG` | The event's slug                           | The event's slug                   |
| `NODE_VERSION`           | `24.18.1`                                  | same                               |
| `PNPM_VERSION`           | `11.20.0`                                  | same                               |

- Cloudflare's build image defaults to Node 24.18.0 and pnpm 10, so set both
  versions. On the first build, check in the log that the install used pnpm
  11 and that the build step ran.
- Cloudflare builds fail on purpose when `VITE_API_BASE_URL` is missing or is
  not an `https://` origin without a path or trailing slash.
- A changed build variable takes effect only on the next build. Use **Retry
  build** after changing one.
- After a deploy, a tab opened before it may fail to load a page it had not
  visited yet (the old file names are gone). Reloading the tab fixes it.

## DNS move to Cloudflare

Custom domains on Workers and the proxy in front of the backend both need the
domain's nameservers on Cloudflare.

1. In Cloudflare, **Add a domain** `losmaspesados.com.mx` (free plan). It
   imports the existing DNS records.
2. Compare the imported records with the current DNS provider, one by one.
   Mail records (`MX`, and `TXT` for SPF, DKIM and DMARC) and the records of
   any existing website must match exactly, or email and that site break after
   the switch. Keep mail records **DNS only** (grey cloud).
3. At the registrar, replace the nameservers with the two Cloudflare gives.
   Propagation can take up to 24 hours; Cloudflare emails when the domain is
   active.
4. **SSL/TLS > Overview**: encryption mode **Full** (not Full (strict), not
   Flexible; see ADR 0008).
5. Frontend: in each Worker, **Settings > Domains & Routes > Add > Custom
   domain** with its hostname. Cloudflare creates the record and certificate.
6. Backend: in Railway, add the custom domain to the backend service. Create
   the `CNAME` it shows in Cloudflare, **Proxied** (orange cloud). If Railway's
   certificate stays in validation, switch the record to DNS only until it is
   issued, then back to Proxied.
7. Set `TRUST_PROXY_HOPS=2` on the backend and redeploy, then run the
   [client IP check](#client-ip-check).
8. **Security > WAF > Rate limiting rules**: add a per-IP rule for the API
   hostnames. Its values stay in the dashboard (ADR 0008).

## First administrator

Run once per environment, after the first successful deploy. Open a shell in
the backend service (`railway ssh`, or **Copy SSH Command** from the service
menu) and follow the [admin bootstrap runbook](admin-bootstrap.md) with the
compiled command:

```bash
ADMIN_BOOTSTRAP_EMAIL='first.admin@example.com' \
ADMIN_BOOTSTRAP_NAME='First Admin' \
node dist/scripts/bootstrap-admin.js
```

The activation link uses `AUTH_TRUSTED_ORIGIN`, so it opens on the
environment's frontend host. It works only after the DNS move.

## Verify an environment

- [ ] `https://<api host>/health` answers `{"status":"ok"}`.
- [ ] `https://<api host>/api/doc` answers `404`.
- [ ] The frontend loads, and reloading a deep link such as `/admin` shows the
      page, not a 404.
- [ ] Admin sign-in works on the frontend host (after the DNS move).
- [ ] The [client IP check](#client-ip-check) passes.
- [ ] Staging: one sandbox purchase confirms, following the
      [sandbox runbook](mercado-pago-sandbox.md) against the staging hosts.
- [ ] Production: the low-amount real purchase from
      [#182](https://github.com/KevinBarrera/nuestro-breaking/issues/182).

### Client IP check

The API limits public requests per client IP (60 per minute by default). It
reads the client from `X-Forwarded-For`, trusting `TRUST_PROXY_HOPS` proxies
([public catalog contract](../contracts/public-event-catalog.md)). Railway
documents only `X-Real-IP`, not how its edge handles `X-Forwarded-For`, so
check the value on the real deployment, each time the proxy chain changes:

1. **Forged addresses share one counter.** From one computer, send 61
   requests, each with a different forged address:

   ```bash
   for i in $(seq 1 61); do
     curl -s -o /dev/null -w '%{http_code}\n' \
       -H "X-Forwarded-For: 203.0.113.$i" \
       https://<api host>/public/events/<slug>/catalog
   done | sort | uniq -c
   ```

   Expected: `60 200` and `1 429`. If every request answers `200`, a client
   can pick its own address: lower `TRUST_PROXY_HOPS` by one and repeat.

2. **Real clients get separate counters.** Right after step 1, open the same
   URL from a phone on mobile data. Expected: `200`. A `429` means everyone
   shares one counter: raise `TRUST_PROXY_HOPS` by one and repeat both steps.
   This step can pass by chance when the value is too low (the phone may reach
   a different proxy address), so it confirms a correct value only together
   with step 1 and the expected value from the table above.

Wait one minute between runs so the counters reset.

## Related

- [ADR 0008: hosting platform](../adr/0008-hosting-platform.md)
- [Admin bootstrap runbook](admin-bootstrap.md)
- [Email delivery runbook](email-delivery.md)
- [Mercado Pago sandbox runbook](mercado-pago-sandbox.md)
