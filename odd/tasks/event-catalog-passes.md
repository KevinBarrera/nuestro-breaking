# Event catalog: activities and pass entitlements

## Tracking

- GitHub issue: #124 — Model pass entitlements for multiple full passes and Open Styles (scope extended to admin catalog CRUD, see Decisions)
- Branch: `feat/124-event-catalog-passes` (from `dev`)
- Plan: `docs/product/november-2026-mvp-delivery-slices.md` (Slice 1)
- Feeds: #126 single-action check-in, #65 pass-based lists, #125/#105 registration flows

## Objective

Make activities and passes event-scoped data that organizers manage from the admin UI, so a new event with different passes needs configuration, not code changes.

## Problem

No pass, price, or entitlement exists in the codebase. Activities have a free-text `kind`, no price, and no create/update/archive path; they are inserted only through SQL in tests. Organizers cannot add workshops announced later or define passes per event.

## Decisions

- 2026-10-06: Passes are event-scoped data, never hardcoded constants (user).
- 2026-10-06: Scope C — data model plus admin API plus admin screen for pass types (user).
- 2026-10-06: Option A — the same feature includes admin CRUD for event activities; venues stay out of scope (user).
- Pass types reference explicit activity IDs, not free-text `kind`, because check-in eligibility already hardcodes kinds (`check-in.service.ts:52`, migration `0010`).
- Records already referenced by registrations are archived, not deleted; each purchased pass stores the price paid.
- Catalog edits get their own append-only audit table; `registration_operation_audit` only accepts registration operations.

## Proposed model

- `activities`: add `status` (`active|archived`) and `version` for optimistic concurrency.
- `event_pass_types`: event, name, class (`full|general|add_on`), `price_cents`, optional `requires_pass_class` rule (Open Styles requires `full`), `status`, `version`.
- `event_pass_type_activities`: pass type → activity with access `selectable` (competitions the buyer chooses) or `included` (granted, e.g. workshops of that discipline).
- `event_registration_passes`: registration → pass type, multiple per registration, `price_cents` snapshot.
- `event_registration_pass_selections`: purchased pass → selected `selectable` activity.
- `event_catalog_audit`: append-only facts for activity and pass type changes (actor, session, entity, operation, before/after, timestamp).

## Tasks

Route per task: delegated writer (2+ non-trivial files each). Test-first: PostgreSQL e2e via Testcontainers for backend, Playwright for frontend.

- [x] T1 Schema and hand-written migration `0011` for the model above, with constraints and e2e coverage of the rules enforceable in SQL.
- [x] T2 Admin activity API: list, create, update (expected version), archive; audited; admin-only writes with CSRF and event scope.
- [x] T3 Admin pass type API: list, create, update, archive, manage activity access; audited.
- [ ] T4 Entitlements: assign passes to a registration and change competition selections (admin, audited); rules: add-on requires its pass class, selections must be `selectable` activities of that pass, general entry grants no activity; read model registration → accessible activities.
- [ ] T5 Admin frontend: activities and pass types screens (list, create, edit, archive, link activities) with Playwright coverage.
- [ ] T6 Local-only seed for the November event (venue, activities, pass types) following `scripts/provision-local-admin.ts` guards.
- [ ] T7 Docs: catalog contract, update event/activity boundary contract, and replace F1–F4 with #124–#127 in the delivery slices matrix.

## Constraints

- Admin role only for writes, never judges; event scope enforced server-side.
- Every accepted catalog mutation and its audit fact commit in one transaction; no personal data in catalog audit.
- No deletion of referenced records; no rewrite of prices already paid.
- Out of scope: venue CRUD, online purchase flow, Mercado Pago, manual registration rework (#125), check-in changes (#126), lists (#65).

## Acceptance criteria

- [ ] An admin can create, edit, and archive activities and pass types for an event from the UI; judges and other events are rejected.
- [ ] A registration can hold several full passes, general entry, and an add-on only when its required pass class is held.
- [ ] Competition selections are stored per purchased pass and limited to that pass's selectable activities.
- [ ] Accessible activities are derivable from entitlements; general entry alone grants none.
- [ ] Every catalog and entitlement change is audited atomically.
- [ ] A new event can be configured with different passes without code changes.

## Checks

- `pnpm format:check`
- Backend: `pnpm --filter backend lint`, `build`, `test`, `test:e2e` (Docker required)
- Frontend: `pnpm --filter frontend lint`, `build`, `test:e2e`

## Delivery

- Forecast: about 2500–3500 authored changed lines; exceeds the 400-line budget.
- Strategy: `ask-on-risk`; chain strategy `stacked-to-main` targeting `dev` (user, 2026-10-06).
- Slices: one PR per task, branches `feat/124-NN-<slug>`, each targets `dev` after its parent merges (retarget/rebase so only the current slice shows).

| Slice | Branch                            | PR   | Commits                                                 |
| ----- | --------------------------------- | ---- | ------------------------------------------------------- |
| T1    | `feat/124-01-catalog-schema`      | #128 | `feat(catalog): add event catalog schema and migration` |
| T2    | `feat/124-02-activity-admin-api`  | #129 | `feat(catalog): add admin activity catalog API`         |
| T3    | `feat/124-03-pass-type-admin-api` | —    | `feat(catalog): add admin pass type catalog API`        |

## Progress

- Exploration done (codebase map: conventions, migrations drift after snapshot `0002`, audit limits, no catalog CRUD, no seed).
- #124 updated on GitHub: approved scope, `status:approved`, new title.
- T1 (delegated writer): migration `0011_event_catalog`, Drizzle schema and `event-catalog-schema.e2e-spec.ts` written; RED 10/10 failing before the migration, GREEN 10/10 after. Lint, build, unit tests (35) pass. Migration-count assertion in `test/event-activity-foundation.e2e-spec.ts` bumped to 12 (human-approved surface). Full e2e 69/69 (11 suites), `pnpm format:check` clean. Route: delegated writer. Design: `requires_pass_class` only on add-ons (`full|general`); selectable-activity rule left to the T4 service (no trigger); audit state check requires `before` null only on `create`.

- T1 outcome: PR #128 opened; native review approved. Advisories pending later handling: audit FK name drift between schema and migration, `TRUNCATE` bypasses the audit immutability trigger, positive-path test gaps in the schema spec.
- T2 (delegated writer): `apps/backend/src/events/activity-admin/` (controller, service, types) registered in `events.module.ts`. Endpoints: `GET /admin/events/:eventId/activities` (`authorizeEventAdmin`, admin only, judges rejected), `POST .../activities`, `PATCH .../activities/:activityId`, `POST .../activities/:activityId/archive` (all `authorizeEventAdminMutation`). Test-first: `test/admin-activity-catalog.e2e-spec.ts` RED 9/10 failing before implementation (the 404 case passed only because routes did not exist), GREEN 10/10 after. Lint, build, unit tests (35) pass; full e2e 79/79 (12 suites); `pnpm format:check` clean. Route: delegated writer (trigger: 2+ non-trivial files).
- T2 design: updates and archives lock the activity row (`FOR UPDATE`) before checking status and `expectedVersion`, so version check and increment cannot interleave; archived → 409, stale version → 409, wrong-event or unknown activity → 404 `Activity not found`. Venue membership and event-window containment are pre-checked for 400s; DB constraints and the `0003` window trigger stay as backstop. Audit `before`/`after` hold the full activity snapshot (no personal data) and are written in the same transaction; an audit failure rolls back the mutation (covered by e2e). Update requires `expectedVersion` plus at least one field.
- Follow-up (out of this slice, #126): check-in should reject archived activities; check-in behavior is unchanged here.
- T2 outcome: PR #129 opened; native review approved. Suggestions pending later handling: distinguish archived vs stale 409 in tests (by message), instant rollover parsing (e.g. `2026-02-30` accepted by `Date`), test constraint cleanup after the audit-atomicity case, more update positive paths.
- T3 (delegated writer): `apps/backend/src/events/pass-type-admin/` (controller, service, types) registered in `events.module.ts`. Endpoints: `GET /admin/events/:eventId/pass-types` (`authorizeEventAdmin`), `POST .../pass-types`, `PATCH .../pass-types/:passTypeId`, `PUT .../pass-types/:passTypeId/activities`, `POST .../pass-types/:passTypeId/archive` (all `authorizeEventAdminMutation`). Test-first: `test/admin-pass-type-catalog.e2e-spec.ts` RED 12/13 failing before implementation (the 404 case passed only because routes did not exist), GREEN 13/13 after. Lint, build, unit tests (35) pass; full e2e 92/92 (13 suites); `pnpm format:check` clean. One unexplained single failure of the access-list validation case in the first GREEN run did not reproduce in 7 later runs (detail not captured). Route: delegated writer (trigger: 2+ non-trivial files).
- T3 design: same lock/version pattern as T2 (`FOR UPDATE`; archived → 409 `Pass type is archived`, stale → 409 `Pass type version conflict`, wrong-event or unknown → 404). Snapshot (`before`/`after`) is the full pass type view including its access list sorted by activity id; `access_change` audits the old and new lists. Active-name uniqueness maps the `event_pass_types_event_active_name_uq` violation (23505, also on Drizzle's `cause`) to 409, so concurrent creates cannot both win; archived names are reusable. `requiresPassClass` is only valid on add-ons, checked on the merged state for updates (changing an add-on to another class requires `requiresPassClass: null`). Access lists reject duplicates (case-insensitive), invalid access values, and non-active or other-event activities; referenced activities are `FOR SHARE` locked so a concurrent archive cannot interleave. Price edits never touch `event_registration_passes.price_cents` (covered by e2e). The audit-atomicity test drops its temporary constraint in `finally`.

## Next step

T4 entitlements (delegated writer).
