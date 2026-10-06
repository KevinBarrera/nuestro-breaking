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
- [x] T4 Entitlements: assign passes to a registration and change competition selections (admin, audited); rules: add-on requires its pass class, selections must be `selectable` activities of that pass, general entry grants no activity; read model registration → accessible activities.
- [x] T5 Admin frontend: activities and pass types screens (list, create, edit, archive, link activities) with Playwright coverage.
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

| Slice | Branch                                  | PR   | Commits                                                   |
| ----- | --------------------------------------- | ---- | --------------------------------------------------------- |
| T1    | `feat/124-01-catalog-schema`            | #128 | `feat(catalog): add event catalog schema and migration`   |
| T2    | `feat/124-02-activity-admin-api`        | #129 | `feat(catalog): add admin activity catalog API`           |
| T3    | `feat/124-03-pass-type-admin-api`       | #130 | `feat(catalog): add admin pass type catalog API`          |
| T4    | `feat/124-04-registration-entitlements` | #131 | `feat(catalog): add admin registration entitlements`      |
| T5    | `feat/124-05-admin-catalog-screens`     | —    | `feat(catalog): add admin activity and pass type screens` |

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

- T3 outcome: PR #130 opened; native review approved. Findings pending later handling: activity-count bound (500) untested, concurrency claims not proven by tests, the unexplained single flake (3/3 independent reruns passed).
- T4 (delegated writer): `apps/backend/src/events/registration-entitlements/` (controller, service, types) registered in `events.module.ts`; hand-written migration `0012_registration_entitlement_audit` (+ journal entry) widens the `registration_operation_audit` operation type check to `pass_assignment` and `pass_selection_change`, mirrored in the Drizzle schema; migration-count assertion bumped to 13. Endpoints under `/admin/events/:eventId/registrations/:registrationId`: `GET .../entitlements` (`authorizeEventAdmin`), `POST .../passes` and `PUT .../passes/:registrationPassId/selections` (`authorizeEventAdminMutation`). Test-first: `test/admin-registration-entitlements.e2e-spec.ts` RED 10/10 failing before implementation, GREEN 10/10 after (focused spec 3/3 consecutive runs green). Lint, build, unit tests (35) pass; full e2e 102/102 (14 suites); `pnpm format:check` clean. Route: delegated writer (trigger: 2+ non-trivial files).
- T4 design: `RegistrationEntitlementsService.accessibleActivityIds(executor, eventId, registrationId)` is the reusable read model for #126/#65: union of active `included` activities of every held pass type and active activities selected on each held pass, sorted; no pass-class special cases (general grants nothing because it has no access rows). Held passes of archived pass types still grant access and still satisfy `requires_pass_class`; selections keep granting even if the pass type's access list changes later (not re-validated on read). Writes lock the registration row (`FOR UPDATE`) to serialize per registration; adding a pass share-locks the pass type (price snapshot and archive cannot interleave); selection changes share-lock the pass type (serializes with access-list replacement) and the selected activities. Errors: unknown/other-event registration → 404 `Registration not found`; unknown/other-event pass type → 404; archived pass type → 409; duplicate pass type → 409 (unique constraint as backstop); non-`pending_payment` registration on add → 409; missing required class → 400 with no writes; voided registration on selections → 409; registration pass of another registration → 404; selections not `selectable`+active for that pass → 400; duplicates rejected case-insensitively; empty list allowed; at most 500 ids. Both writes return the full entitlements view. Audit rows (same transaction, rollback covered by e2e): `participant_id` from the registration, `amount_cents` null, `affected_activity_ids` = [] for assignments and the union of old and new selections for selection changes, `before_state`/`after_state` hold only ids, price snapshot and selections, `facts` holds `{ registrationPassId, passTypeId }`; no personal data.
- T4 open: concurrency (registration lock) is not exercised by a concurrent test; selection count bound (500) untested.
- T4 outcome: PR #131 opened; native review approved. Findings pending later handling: selection behavior for passes of archived pass types is unspecified, concurrency claims unproven by tests, selection bound (500) untested.
- T5 (delegated writer): new entity slice `apps/frontend/src/entities/event-catalog` (`api/` fetch, CSRF and manual response validation; `model/` MXN money and event-time-zone conversions) and admin pages `/admin/events/:eventId/activities` and `/admin/events/:eventId/pass-types` inside `AdminSessionBoundary`, linked per event from a new "Catálogo de eventos" section on `/admin`. Test-first: `apps/frontend/e2e/admin-event-catalog.spec.ts` RED 10/10 failing before implementation, GREEN 10/10 after (two spec fixes during GREEN: StrictMode repeats the initial read in dev, so the refresh assertion compares reads before and after the write; pass rows are matched by heading because "Requiere pase Completo" contains "pase completo"). Frontend lint 0 errors (2 pre-existing warnings in `admin-check-in-page.tsx`), build passes, full mocked Playwright suite 45/45, `pnpm format:check` clean. Live suite not run (needs the backend server). Route: delegated writer (trigger: 2+ non-trivial files). Size: about 2000 authored lines, above the 400-line heuristic because the slice holds two full CRUD screens, the entity API and their tests.
- T5 design: writes fetch `/auth/session` for `X-CSRF-Token`, use `credentials: 'include'`, and report success only from a validated backend response, then refetch the list; reads use `AbortController`. Failures map to safe Spanish copy (401/403 sin acceso, 404, 409 conflicto con botón Recargar, 400 datos inválidos); backend messages are never shown. Activity times are entered and shown in the event time zone from `GET /admin/events/:eventId/foundation` (venues come from the same response); DST-skipped wall times are rejected. Edits send every field plus `expectedVersion`; archive uses an inline confirmation. Pass prices are entered in pesos and sent as integer cents; "Requiere pase" appears only for add-ons and is sent as `null` otherwise. The access editor lists only active activities (the API rejects archived ones), so links to archived activities are dropped on save with a visible warning.
- T5 open: pass type edit and archive paths and activity-form validation errors have no dedicated Playwright case; the session boundary header subtitle is not set for the catalog pages (outside the allowed edit surface).

## Next step

T6 local-only seed for the November event (delegated writer).
