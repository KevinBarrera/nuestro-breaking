# Event catalog contract

This contract describes the delivered event catalog for issue #124: admin-managed activities, pass types with activity access, and registration pass entitlements. Everything here is implemented and covered by backend e2e tests; gaps are listed at the end.

## Current answer

- Activities and pass types are **event-scoped data** that admins manage through the API and the admin UI. A new event with different passes needs configuration, not code changes.
- A registration holds **zero or more passes**. Each held pass stores the price paid. Competition selections are stored per held pass.
- **Accessible activities = active `included` activities of every held pass type + active activities selected on each held pass.** No pass class is special-cased; general entry grants nothing because it has no access rows.
- Catalog records are **archived and restorable, never deleted**. Writes use **optimistic concurrency** (`expectedVersion`) and are **audited in the same transaction**.

## Data model

Migrations: `apps/backend/drizzle/0011_event_catalog.sql`, `apps/backend/drizzle/0012_registration_entitlement_audit.sql`.

| Table                                | Key fields                                                                                                                          | Rules enforced in SQL                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `activities` (extended)              | `status` (`active` \| `archived`, default `active`), `version` (> 0, default 1)                                                     | Existing foundation rules still apply (attached venue, ordered interval, event-window containment).                                            |
| `event_pass_types`                   | `event_id`, `name`, `pass_class` (`full` \| `general` \| `add_on`), `price_cents` (≥ 0), `requires_pass_class`, `status`, `version` | Nonblank name; `requires_pass_class` only on `add_on` and only `full` \| `general`; active names unique per event (case-insensitive, trimmed). |
| `event_pass_type_activities`         | `event_id`, `pass_type_id`, `activity_id`, `access` (`selectable` \| `included`)                                                    | Pass type and activity must belong to the same event.                                                                                          |
| `event_registration_passes`          | `event_id`, `event_registration_id`, `pass_type_id`, `price_cents` (snapshot, ≥ 0), `created_at`                                    | One pass per pass type per registration; registration and pass type in the same event.                                                         |
| `event_registration_pass_selections` | `event_id`, `registration_pass_id`, `activity_id`                                                                                   | Same-event scope only. The "must be a `selectable` activity of that pass" rule is enforced by the service.                                     |
| `event_catalog_audit`                | `event_id`, `actor_user_id`, `actor_session_id`, `entity_type`, `entity_id`, `operation`, `before`, `after`, `occurred_at`          | Append-only (update/delete trigger raises); `before` is null only on `create`.                                                                 |

`registration_operation_audit.operation_type` additionally accepts `pass_assignment` and `pass_selection_change` (migration `0012`).

`event_catalog_audit.operation` accepts `create`, `update`, `archive`, `restore` and `access_change` (`restore` added by migration `0013`).

## Admin API

All routes live under `/admin/events/:eventId` and require a session cookie with an `admin` role, global or scoped to that event. Judges are rejected. Writes also require the trusted `Origin` and the `X-CSRF-Token` header ([admin authentication boundary](admin-auth-boundary.md)).

### Common responses

| Status | When                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid body or field (non-UUID ids, blank or long text, malformed instants, invalid enum, rule violation).          |
| 401    | No valid session, judge or other non-admin role, or admin of another event (`Unauthenticated`).                      |
| 403    | Write with an untrusted `Origin` or a missing or invalid CSRF token (`Request denied`).                              |
| 404    | Target id unknown or belonging to another event. Path ids that are not UUIDs fail with 400.                          |
| 409    | Target archived (or not archived, on restore), stale `expectedVersion`, or a uniqueness/state conflict listed below. |

### Activities

Code: `apps/backend/src/events/activity-admin/`. Response: `AdminActivity` (`id`, `eventId`, `venueId`, `kind`, `name`, `startsAt`, `endsAt`, `status`, `version`).

| Method and path                                              | Auth         | Body                                                                                       | Specific errors                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/events/:eventId/activities`                      | admin        | —                                                                                          | Lists active and archived activities, ordered by start, name, id.                                                                                                                                                                                                                                                    |
| `POST /admin/events/:eventId/activities`                     | admin + CSRF | `venueId`, `kind` (≤ 100), `name` (≤ 200), `startsAt`, `endsAt` (ISO instants with offset) | 400 `Invalid venue` (not attached to the event), 400 `Invalid activity window` (unordered or outside the event).                                                                                                                                                                                                     |
| `PATCH /admin/events/:eventId/activities/:activityId`        | admin + CSRF | `expectedVersion` plus at least one create field                                           | 400 `Invalid update` (no field); 404 `Activity not found`; 409 `Activity is archived`; 409 `Activity version conflict`.                                                                                                                                                                                              |
| `POST /admin/events/:eventId/activities/:activityId/archive` | admin + CSRF | `expectedVersion`                                                                          | 404; 409 archived or stale version.                                                                                                                                                                                                                                                                                  |
| `POST /admin/events/:eventId/activities/:activityId/restore` | admin + CSRF | `expectedVersion`                                                                          | 404 `Activity not found`; 409 `Activity is not archived`; 409 `Activity version conflict`; 409 `Activity no longer fits its venue or the event window` (the stored venue, interval or event window no longer matches the event). Pass access links are kept, so the activity reappears in passes that still link it. |

### Pass types

Code: `apps/backend/src/events/pass-type-admin/`. Response: `AdminPassType` (`id`, `eventId`, `name`, `passClass`, `priceCents`, `requiresPassClass`, `status`, `version`, `activities[]` sorted by activity id).

| Method and path                                                | Auth         | Body                                                                                                     | Specific errors                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/events/:eventId/pass-types`                        | admin        | —                                                                                                        | Lists active and archived pass types, ordered by name, id.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /admin/events/:eventId/pass-types`                       | admin + CSRF | `name`, `passClass`, `priceCents` (integer cents), optional `requiresPassClass`, optional `activities[]` | 400 `Only add-on passes may require a pass class`; 400 `Invalid activity` (archived, unknown or other-event); 409 active name already exists.                                                                                                                                                                                                                                                                                                                          |
| `PATCH /admin/events/:eventId/pass-types/:passTypeId`          | admin + CSRF | `expectedVersion` plus at least one of `name`, `passClass`, `priceCents`, `requiresPassClass`            | Add-on rule checked on the merged state (changing an add-on to another class needs `requiresPassClass: null`); 404; 409 archived, stale, or name.                                                                                                                                                                                                                                                                                                                      |
| `PUT /admin/events/:eventId/pass-types/:passTypeId/activities` | admin + CSRF | `expectedVersion`, `activities[]` of `{ activityId, access }` (≤ 500, no duplicates); replaces the list  | 400 invalid or duplicate entry, or non-active/other-event activity; 404; 409 archived or stale.                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /admin/events/:eventId/pass-types/:passTypeId/archive`   | admin + CSRF | `expectedVersion`                                                                                        | 404; 409 archived or stale.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /admin/events/:eventId/pass-types/:passTypeId/restore`   | admin + CSRF | `expectedVersion`                                                                                        | 404 `Pass type not found`; 409 `Pass type is not archived`; 409 `Pass type version conflict`; 409 `An active pass type with this name already exists; rename one of them before restoring` (same trimmed, case-insensitive name; nothing is written). Access links are kept exactly as they were, including links to archived activities. The pass type becomes assignable to registrations again; held passes and selections are never changed by archive or restore. |

### Registration entitlements

Code: `apps/backend/src/events/registration-entitlements/`. Response for all three routes: `RegistrationEntitlements` (`passes[]` of `{ registrationPassId, passTypeId, name, passClass, priceCents, selections[] }`, and sorted `accessibleActivityIds[]`).

| Method and path                                                                                  | Auth         | Body                                                                    | Specific errors                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/events/:eventId/registrations/:registrationId/entitlements`                          | admin        | —                                                                       | 404 `Registration not found`.                                                                                                                                                                            |
| `POST /admin/events/:eventId/registrations/:registrationId/passes`                               | admin + CSRF | `passTypeId`                                                            | 404 registration or pass type; 409 `Pass type is archived`; 409 `Registration is not pending payment`; 409 `Registration already holds this pass type`; 400 `Add-on requires a <class> pass` (no write). |
| `PUT /admin/events/:eventId/registrations/:registrationId/passes/:registrationPassId/selections` | admin + CSRF | `activityIds[]` (≤ 500, no duplicates, may be empty); replaces the list | 404 registration or registration pass; 409 `Registration is voided`; 400 `Invalid activity selection` (not an active `selectable` activity of that pass type).                                           |

## Rules

| Rule                              | Delivered behavior                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive and restore, never delete | No delete endpoint exists. Archived records stay readable and cannot be edited (409) until restored. Archived pass type names become reusable; restoring a pass type whose name an active pass type now uses returns 409 until one of them is renamed.                                                                                            |
| Optimistic concurrency            | Every update, access change, archive and restore takes `expectedVersion`, locks the row (`FOR UPDATE`), and increments `version`. Stale versions get 409; nothing is overwritten silently.                                                                                                                                                        |
| Active-name uniqueness            | Applies to pass types only (partial unique index; a concurrent duplicate maps to 409). Activity names are not unique.                                                                                                                                                                                                                             |
| Add-on requirement                | An add-on with `requiresPassClass` can be assigned only when the registration already holds a pass of that class. Held passes of archived pass types still satisfy it.                                                                                                                                                                            |
| Selections                        | Limited to active activities with `selectable` access on that pass's type. Selections are not re-validated on read if the access list changes later.                                                                                                                                                                                              |
| Adding passes                     | Only while the registration is `pending_payment`. Price is copied into `event_registration_passes.price_cents`; later price edits never rewrite it.                                                                                                                                                                                               |
| Accessible activities             | `RegistrationEntitlementsService.accessibleActivityIds` is the reusable read model for check-in (#126) and lists (#65). Archived activities are excluded; restoring an activity gives holders access again through the access links that still point to it. Archiving or restoring a pass type does not change the access of passes already held. |
| Data-driven passes                | No code branches on pass names or on `full`/`general`. Pass class only drives the add-on requirement.                                                                                                                                                                                                                                             |

## Audit semantics

| Change                                     | Table                          | Operation                                | Content                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity create, update, archive, restore  | `event_catalog_audit`          | `create`, `update`, `archive`, `restore` | Full `AdminActivity` snapshot in `before`/`after`; a restore records the archived snapshot in `before` and the active one in `after`. Catalog data only, no personal data.                      |
| Pass type create, update, archive, restore | `event_catalog_audit`          | `create`, `update`, `archive`, `restore` | Full `AdminPassType` snapshot, including the sorted access list; a restore records the archived snapshot in `before` and the active one in `after`.                                             |
| Pass type access list replacement          | `event_catalog_audit`          | `access_change`                          | Old and new snapshots.                                                                                                                                                                          |
| Pass added to a registration               | `registration_operation_audit` | `pass_assignment`                        | `participant_id` from the registration; `amount_cents` null; `affected_activity_ids` empty; state holds ids, price snapshot and selections; `facts` holds `{ registrationPassId, passTypeId }`. |
| Selections replaced                        | `registration_operation_audit` | `pass_selection_change`                  | Same shape; `affected_activity_ids` is the union of old and new selections.                                                                                                                     |

Each audit row is written in the same transaction as its mutation; an audit failure rolls the mutation back (covered by e2e). Actor user and session come from the authorized admin session.

**The local seed writes no audit rows.** `event_catalog_audit` requires a real admin user and auth session (non-null foreign keys), and seed data is local bootstrap data, not an admin operation. Fabricating an actor would make the audit trail lie.

## Admin UI

Pages `/admin/events/:eventId/activities` and `/admin/events/:eventId/pass-types` (`apps/frontend/src/pages/admin/ui/admin-event-activities-page.tsx`, `admin-event-pass-types-page.tsx`, API client in `apps/frontend/src/entities/event-catalog/`). Prices are entered in pesos and sent as integer cents; activity times are entered in the event time zone. Registration entitlements have no UI yet.

## Local seed

Local-only bootstrap for the November event (organization, venue, event, 15 competition activities, 6 pass types and their access links). Code: `apps/backend/src/events/catalog-seed/`, CLI `apps/backend/scripts/seed-november-catalog.ts`.

```bash
LOCAL_CATALOG_SEED=I_UNDERSTAND_THIS_IS_LOCAL_ONLY \
  pnpm --filter @nuestro-breaking/backend catalog:seed:november --confirm-local-only=seed-november-catalog
```

- Do not add a `--` separator; the strict flag parser rejects it.
- The guard refuses non-local `NODE_ENV` values and non-localhost database URLs.
- Idempotent: natural keys are trimmed, case-insensitive names; existing records (in any status) are never updated, so admin edits and archives survive re-runs.
- Dates (21–22 November 2026, `America/Mexico_City`) are sample data pending organizer confirmation. No workshops are seeded.
- The seeded event is named "Los más pesados - Preliminares - Noviembre 2026" (formerly "Nuestro Breaking Noviembre 2026", renamed in #145). The organization stays "Nuestro Breaking".
- Renaming a seeded record does not migrate existing data. The seed matches records by name, so a local database seeded before the rename keeps the old event, and re-running the seed creates a second event with its own activities and pass types. To pick up the new name locally, choose one before re-running the seed:
  - Rename the existing row: `UPDATE events SET name = 'Los más pesados - Preliminares - Noviembre 2026' WHERE name = 'Nuestro Breaking Noviembre 2026';`. This keeps registrations, admin users and edits.
  - Reset the local database. There is no dedicated reset script; the PostgreSQL data lives in the `postgres_data` Compose volume. Run `docker compose down -v`, then `docker compose up -d postgres` and `pnpm --filter @nuestro-breaking/backend db:migrate`. This deletes all local data, including admin users.

## Known gaps and follow-ups

| Gap                                                                                                                                                                                                                                                                                          | Follow-up                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Check-in still accepts archived activities and still checks hardcoded activity kinds instead of entitlements.                                                                                                                                                                                | #126                                           |
| No payment adjustment when passes are added or prices differ; passes can only be added before payment.                                                                                                                                                                                       | #125, #104                                     |
| The [versioning contract](api-event-versioning.md) is only partly applied: `expectedVersion` is used, `commandId` idempotency is not.                                                                                                                                                        | Later hardening                                |
| `GET .../foundation` returns archived activities without a status field.                                                                                                                                                                                                                     | Later hardening                                |
| Selection behavior for passes of archived pass types is unspecified.                                                                                                                                                                                                                         | Product decision                               |
| Review advisories: concurrency claims and 500-item bounds untested; audit FK name drift between schema and migration; `TRUNCATE` bypasses the audit immutability trigger; instant rollover parsing (`2026-02-30`); seed CLI, natural-key normalization and archived-skip on create untested. | Tracked in `odd/tasks/event-catalog-passes.md` |
| Frontend hardening (pass type edit/archive tests, comma money parsing, seconds on edit, venue-missing state).                                                                                                                                                                                | T8 of #124                                     |

## Cross-references

- [Event/activity foundation contract](event-activity-foundation.md)
- [Event/activity API boundary](event-activity-api-boundary.md)
- [Admin authentication boundary](admin-auth-boundary.md)
- [Admin registration audit policy](admin-registration-audit-policy.md)
- [November 2026 MVP delivery slices](../product/november-2026-mvp-delivery-slices.md)
