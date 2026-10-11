# ADR 0008: Host the Frontend on Cloudflare and the Backend and Database on Railway

## Status

Accepted on 2026-10-11. The product owner chose the platforms. Prices were checked on that date.

## Context

The project needs a staging and a production environment, and it runs on a non-profit budget. Staging must have the same shape as production, so that a free tier for staging does not hide what production will cost.

The system has three parts to host:

- **Frontend:** the Vite build is static files.
- **Backend:** NestJS is a long-running Node process. It also runs background work, such as the confirmation email sweeper, which polls the database every minute (`EMAIL_DISPATCH_INTERVAL_MS`, default 60000).
- **Database:** PostgreSQL. Several services take row locks (`FOR UPDATE`, `SKIP LOCKED`), so SQLite-based stores such as Cloudflare D1 do not fit.

The admin session also limits where these parts can live:

- The `nb_admin_session` cookie is host-only and `SameSite=Strict`.
- The backend accepts admin requests only from `AUTH_TRUSTED_ORIGIN`.

The frontend and the backend therefore need to share one registrable domain that the organization owns, for example `[domain]` and `api.[domain]`. Two provider subdomains such as `*.pages.dev` and `*.up.railway.app` are different sites, and admin sign-in would fail.

## Decision

- **Cloudflare, free plan:** DNS for the custom domain, hosting for the frontend's static files, and the proxy in front of the backend's public hostname.
- **Railway, Hobby plan:** the backend container and PostgreSQL. Staging and production are two environments in the same project.
- Each environment has its own frontend host, backend host, database, secrets and `AUTH_TRUSTED_ORIGIN`. All of them use HTTPS.

## Required cost controls

Railway bills by usage: CPU, memory, disk and network egress. Without a cap, traffic from an attack turns directly into a bill. The following controls are required before any environment is exposed:

1. A Railway **hard usage limit** on the workspace. When usage reaches it, Railway takes every workload offline, so the bill cannot grow past it. A soft limit, which only sends an email, is set below the hard limit as an early warning.
2. CPU and memory limits on every service, so traffic cannot scale a service without bound.
3. The backend hostname goes through the Cloudflare proxy. Cloudflare filters denial-of-service traffic, and a rate limiting rule caps requests per client.
4. The backend reaches the database over Railway's private network, so that traffic is not billed as egress.

The limit amounts, alert thresholds and rate limiting values are operational settings. They live in the provider dashboards, not in this public repository, so the repository does not tell an attacker how much traffic would take the service offline.

The hard limit applies to the whole workspace, not to one project. If staging and production share a workspace, an attack on staging can use up the budget and take production offline too. Give staging lower resource limits than production, or put it in its own workspace with its own limit.

## Why

- It is the cheapest option tested that covers both environments: about $8–15 USD a month in Railway usage, and $0 for Cloudflare.
  - The Hobby plan costs $5 a month and includes $5 of usage, so the bill is whichever is higher.
  - The estimate assumes four services (a backend and a database in each environment), each using 150–250 MB of memory and little CPU.
  - The real number will be known after the first month.
- Staging and production run on the same platforms with the same shape.
- Two platforms instead of three.
- No lock-in:
  - the frontend is static files;
  - the backend is a standard Docker image;
  - the database is standard PostgreSQL;
  - email sits behind `EmailSender` ([ADR 0007](0007-email-delivery-service.md)).

  Moving any part does not require rewriting code.

## Alternatives considered

| Option                                     | Monthly cost | Why it was not chosen                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare + Render + Neon                 | ≈ $26 USD    | Render's free instances sleep after 15 minutes, so staging would not match production. Neon scales to zero when idle, but the email sweeper keeps it awake, so production would pay for a full month of compute. Render has fixed instance prices, which limits attack-driven cost, but the total costs more than Railway. |
| As much as possible on Cloudflare          | ≈ $31 USD    | Containers need the $5 Workers plan, plus a Worker and a Durable Object in front of the container. Cloudflare has no PostgreSQL, so the database would still live elsewhere.                                                                                                                                               |
| Rewrite the backend for Cloudflare Workers | —            | Rewriting the NestJS backend and its background work for Workers is out of scope for the MVP.                                                                                                                                                                                                                              |

## Consequences

- The organization must buy and own a domain. It is a yearly cost, separate from the monthly estimate above.
- An attack that reaches the hard limit causes downtime, not debt. On event day, the paper fallback covers that case.
- Before production, confirm:
  - how Railway backs up and restores PostgreSQL on the Hobby plan;
  - whether database data survives when the hard limit takes workloads offline. Test this in staging with a low limit.

  If backups fall short, the production database can move to another managed PostgreSQL provider without changing the rest.

- Hosted environments need a supported way to create the first administrator, because `admin:provision` refuses to run outside a local database (#214).
- Socket.IO ([ADR 0004](0004-realtime-transport.md)) keeps working on Railway, because the backend is a normal Node process.

## Sources

- Railway plans: https://docs.railway.com/pricing/plans
- Railway usage limits: https://docs.railway.com/reference/usage-limits
- Cloudflare rate limiting on all plans: https://blog.cloudflare.com/unmetered-ratelimiting/
- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Neon pricing: https://neon.com/pricing
