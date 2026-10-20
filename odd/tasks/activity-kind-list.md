# Activity kind list

## Tracking

- GitHub issue: #249 — Pick an activity's type from a fixed list instead of free text
- Branch: `feat/249-activity-kind-list` → `dev` (base `7f48e1d`), one PR with one commit per task.
- Relates to #126, whose check-in rules depend on the activity type.

## Goal

An activity's `kind` is one of `battle` (Batalla), `competition` (Competencia), `workshop` (Taller) and `social` (Social). The backend rejects any other value with `400`, the database enforces the same list, and the admin form picks the type from a select with the Spanish labels.

## Decisions

- **Migration of existing rows:** normalize first (trim, lowercase, and map the Spanish labels `taller`, `batalla` and `competencia` to their codes). Then fail with a clear message that lists the ids of any row still outside the list. The hosted environments are not deployed yet (#238), so only local databases can hold other values. The `UPDATE` writes no catalog audit row and bumps no `version`; the migration header says so.
- **Validation:** keep the trim before the membership check, so `' workshop '` is still accepted.
- **Out of scope:** admin-defined types, and changing which types support check-in (the `0010` trigger and `check-in.service.ts:52` stay as they are).

## Tasks

- [x] 1. Backend: an `ActivityKind` constant in `src/events/activity-admin/activity-kind.ts`; membership check in the controller; narrowed types; schema check from the constant; migration `0031` with journal entry; unit and PostgreSQL e2e for an unknown kind (400) and the database rejection. (`ACTIVITY_KINDS` lives in `schema/activities.ts`, like the other schema enums, so the schema never imports from `events`; `activity-kind.ts` re-exports it with `isActivityKind`. The column uses `{ enum }`, so the read types narrow without casts. RED: unit spec missing module, 14/31 in the catalog and schema e2e; GREEN: unit 600, full backend e2e 452 passed; lint and build pass. The migration test asserts the `[P0001]` message an operator sees and that the row is left untouched. `check-in.e2e-spec.ts` now uses `social` as its non-check-in kind, and the migration count in `event-activity-foundation.e2e-spec.ts` is 32.)
- [x] 2. Frontend: kinds and Spanish labels in `entities/event-catalog`; "Tipo" becomes the shared `Select` (placeholder "Elige un tipo", required message "Elige el tipo de la actividad."), preselected when editing; drop `kindSuggestions`; Vitest for the options and labels; Playwright picks a type in the catalog and modal specs. (`activityKinds`, `ActivityKind` and `isActivityKind` live in `entities/event-catalog/model/activity-kind.ts`. `CatalogActivity.kind` and `ActivityInput.kind` stay `string`, and the reader keeps `text(row.kind)`: narrowing them breaks `activity-changes.test.ts`, which still uses an unknown kind. The labels stay in `catalog-copy.ts`, typed `Record<ActivityKind, string>`, because only the admin slice shows them; `activityKindOptions` feeds the select and `activityKindLabel` keeps its as-stored fallback. A stored kind outside the list counts as unselected, like a missing venue. `workshopKind` is typed `ActivityKind`; the check-in page keeps its own `eligible` set, since it reads its own response shape. RED: Vitest 2 files (missing module, undefined options), Playwright 4 tests without a "Tipo" select; GREEN: Vitest 538, Playwright 175 across the catalog, modal, agenda, check-in and admin sweep specs; lint, build and prettier pass.)
- [x] 3. Docs: `event-catalog.md`, `event-activity-foundation.md`, `event-activity-api-boundary.md`. (The kind list, `Invalid kind`, migration 0031 and the resolved deferred decision. `november-2026-mvp-delivery-slices.md:60` is left as it is, because it belongs to the pre-#124 planning record.)

## Evidence

- Exploration on 2026-10-20: `activities_kind_ck` comes from `0002_event_activity_membership.sql:17` and checks only for a non-blank value. The controller accepts any text up to 100 characters (`activity-admin.controller.ts:49`). The kinds are duplicated in `check-in.service.ts:52`, `activity-form.tsx:26`, `admin-check-in-page.tsx:24` and `activity-agenda-model.ts:10`. Most fixtures already use the four codes; `check-in.e2e-spec.ts` also used `open format`, `general entry` and `party` as non-check-in kinds, now replaced by `social`.
