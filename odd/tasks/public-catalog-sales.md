# Public catalog and sales window — issue #175

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/175 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Design: https://claude.ai/artifact/3YcyJrmcNummhmW4DijMGW (buyer flow, mobile-first)
- Engram mirror: `odd/public-catalog-sales/tasks`
- Base: `dev` at `2b11c2c` (PR #183 merged)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #175`, `Closes #175` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `2b11c2c`.

## Objective

Expose a public, read-only catalog for one event and an admin-controlled sales open/closed state, so the public purchase screens (#176) and the public registration (#174) can use real data without login.

## Decisions

- D1 (user, 2026-10-08) — Public addressing by event slug. Each event has a stable slug (for example `los-mas-pesados-nov-2026`); `/` shows the configured event and each event is reachable by its own address. The frontend routing itself belongs to #176.
- D2 (user, 2026-10-08) — Sales state is an admin switch (open/closed) with optional opening and closing dates.
- D3 (technical default) — The slug is set by migration/seed and is not editable from the admin UI in the MVP, so shared links stay stable.
- D4 (technical default) — With sales closed, the public catalog reports the closed state and its dates but lists no passes.
- D5 (technical default) — Public responses expose only what the buyer flow needs: pass and activity ids (needed by #174), names, classes, prices, the Open Styles requirement and schedules; never `version`, `status`, organization ids or personal data.

## Current state (exploration, 2026-10-08)

- `events` (`apps/backend/src/database/schema/events.ts:14-45`) has no slug, sales or status column; no "current event" concept anywhere.
- Catalog: `event_pass_types` (`pass_class` full/general/add_on, `price_cents`, `requires_pass_class`, `status`), `event_pass_type_activities` (`access` selectable/included), `activities` (`status`). Open Styles is data: an `add_on` requiring `full` (`src/events/catalog-seed/november-catalog.ts:91-96`).
- Admin reads: `PassTypeAdminService.list` (`pass-type-admin.service.ts:69-93`) includes archived rows; `toPassType` is private and is the audit snapshot shape, so the public projection is separate.
- Auth is per controller through `SessionAccessService`; no global guard, so a public controller needs no opt-out.
- CORS (`src/main.ts:9-13`): single `AUTH_TRUSTED_ORIGIN` with credentials. No throttling package.
- Migrations are hand-written (`drizzle/`, journal up to `0013`); next is `0014`.
- Tests: no Jest specs in `src/events`; e2e model `test/admin-pass-type-catalog.e2e-spec.ts` with `test/support/postgres-harness.ts`.
- Admin frontend: `admin-event-overview-page.tsx` is the per-event landing page and has no settings form.

## Constraints

- Backend: NestJS + Drizzle; hand-written migrations; e2e with disposable PostgreSQL (Docker).
- Frontend: FSD, `@/` slice imports, Tailwind tokens, Spanish copy, 44px targets, 4.5:1 contrast.
- Test-first where a deterministic RED is observable. About 400 authored lines per slice is a planning heuristic, not a cap.

## Slices and tasks

Forecast: ~1,300–1,600 authored lines over 4 PRs.

### PR 1 — `feat/175-01-event-sales-state`

- [x] T1 — Migration `0014`: `events.slug` (unique, lowercase kebab-case check) and sales columns (switch plus optional opening/closing dates, opening before closing). Seed sets the slug. Pure sales-state function (open/closed with reason) with Jest unit specs. Admin `GET`/`PUT /admin/events/:eventId/sales` with admin + CSRF. Contract doc. PostgreSQL e2e.

### PR 2 — `feat/175-02-public-catalog-api`

- [ ] T2 — Fix the T1 advisories (calendar-date rollover → 400, seed slug conflict handled and tested). `GET /public/events/:slug/catalog`: 404 for unknown slug; event summary and sales state; when open, active passes with prices, Open Styles requirement and active selectable/included activities; archived rows never appear (D4, D5). Reusable sales-open check for #174. Contract doc. Jest + PostgreSQL e2e.

### PR 3 — `feat/175-03-public-rate-limit-cors`

- [ ] T3 — Rate limiting for public routes and CORS restricted to configured public origins (env), without loosening admin CORS or credentials. Env docs. Specs.

### PR 4 — `feat/175-04-admin-sales-ui`

- [ ] T4 — Admin UI on the event overview to open/close sales and set optional dates, with the public address shown. Playwright flows; docs.

## Acceptance criteria

See issue #175. Evidence is recorded per task below.

## Progress

- 2026-10-08 — D1 and D2 answered. Exploration done (delegated read-only explorer). Feature doc created. Next: T1.
- 2026-10-08 — T1 done in `3d34329` (schema, seed) and `f5af324` (sales service, admin API, contract). Migration `0014_event_sales_state` adds `events.slug` (unique, kebab-case check, deterministic `event-<id>` backfill, random default for new rows), `sales_enabled` (default false), `sales_opens_at`, `sales_closes_at` (window check). Seed sets `los-mas-pesados-nov-2026` and replaces a generated slug on re-run. Pure `salesState` in `apps/backend/src/events/sales/` (opening inclusive, closing exclusive, switch wins). Admin `GET`/`PUT /admin/events/:eventId/sales`. Sales changes are not audited (`event_catalog_audit` entity check excludes events); recorded as a known gap in `docs/contracts/event-sales.md`. RED observed: unit spec (3 failing against a stub), seed e2e (2 failing), admin sales e2e (6 failing before the controller). Checks: backend lint, unit 42/42, build, full e2e 138/138, format. Parent spot check: unit 42/42. Review: medium (742 lines), consent granted, reliability lens approved and acknowledged (lineage `review-37fb773147462fc5`). Advisory, carried into T2: impossible calendar dates like `2026-02-31` roll over instead of 400 (`event-sales.controller.ts:18`); the seed insert can hit the slug unique index when an event with that slug exists under another name (`seed-november-catalog.ts:114`); the slug-taken branch is untested (`seed-november-catalog.ts:212-218`). Next boundary: `f5af324`.

## Route per task

- T1 — delegated writer (writer trigger: migration, schema, service, controller, specs, contract).
