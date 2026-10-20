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
- [ ] 2. Frontend: kinds and Spanish labels in `entities/event-catalog`; "Tipo" becomes the shared `Select` (placeholder "Elige un tipo", required message "Elige el tipo de la actividad."), preselected when editing; drop `kindSuggestions`; Vitest for the options and labels; Playwright picks a type in the catalog and modal specs.
- [ ] 3. Docs: `event-catalog.md`, `event-activity-foundation.md`, `event-activity-api-boundary.md`, `november-2026-mvp-delivery-slices.md`.

## Evidence

- Exploration on 2026-10-20: `activities_kind_ck` comes from `0002_event_activity_membership.sql:17` and checks only for a non-blank value. The controller accepts any text up to 100 characters (`activity-admin.controller.ts:49`). The kinds are duplicated in `check-in.service.ts:52`, `activity-form.tsx:26`, `admin-check-in-page.tsx:24` and `activity-agenda-model.ts:10`. Most fixtures already use the four codes; `check-in.e2e-spec.ts` also used `open format`, `general entry` and `party` as non-check-in kinds, now replaced by `social`.
