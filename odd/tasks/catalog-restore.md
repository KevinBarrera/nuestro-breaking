# Catalog restore — issue #147

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/147 (source of truth for scope and acceptance criteria)
- Design: https://claude.ai/artifact/FWf7esvJizsGZjmNvSoK8f (boards "Actividades · editar en modal" for the archived row with "Restaurar", and "Pases · lista" for the "Archivados" section)
- Engram mirror: `odd/catalog-restore/tasks`
- Base: `dev` at `0b708b0` (all of #146 merged)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #147`, `Closes #147` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `0b708b0`.

## Objective

Let administrators restore an archived activity or pass type. Archive becomes reversible: records are archived and restorable, never deleted.

## Why

Catalog setup mistakes are likely, and today an archive cannot be undone. Confirmed for the November MVP (#57).

## Decisions

- D1 (user, 2026-10-07) — A restored pass type keeps exactly the access links it had when archived.
- D2 (user, 2026-10-07) — A restored activity reappears in the passes that still link to it, with the same access. Links dropped by an access save while the activity was archived do not come back.
- D3 (technical default) — A restored activity that no longer fits its venue, interval or event window returns 409 with a clear message, not 400: the request body is valid, and the stored record conflicts with the current event.

## Current state (exploration, 2026-10-07)

- Archive endpoints: `activity-admin.controller.ts:112-123`, `pass-type-admin.controller.ts:163-174`; auth and CSRF through `authorizeEventAdminMutation`; bodies checked by hand with `object()`/`version()`.
- Services lock with `lockEditable` (`FOR UPDATE`, 404, 409 archived, 409 version). Restore needs the reverse check.
- Audit `operation` is limited by a CHECK constraint (`drizzle/0011_event_catalog.sql:76`), so `restore` needs migration `0013` plus a `_journal.json` entry, following `0012`.
- Active pass-type name uniqueness is a partial unique index; `guardName()` maps its 23505 to 409.
- `assertPlacement` (activity service :114-132) checks interval, venue and event window.
- Archive does not delete `eventPassTypeActivities` rows, so D1 and D2 need no data changes.
- Backend coverage is PostgreSQL e2e only (`apps/backend/test/admin-activity-catalog.e2e-spec.ts`, `admin-pass-type-catalog.e2e-spec.ts`).
- Frontend: archived activities show under "Mostrar archivadas" with no actions; the pass list already renders archived cards with an "Archivado" badge and no link; an archived pass detail shows not found.

## Constraints

- Backend: NestJS + Drizzle; hand-written migrations; e2e with disposable PostgreSQL (Docker).
- Frontend: FSD, `@/` slice imports, Tailwind tokens, Spanish copy, 44px targets, 4.5:1 contrast; reuse `ConfirmDialog` from #146.
- Test-first where a deterministic RED is observable. About 400 authored lines per slice is a planning heuristic, not a cap.

## Slices and tasks

Forecast: ~1,200–1,500 authored lines over 4 PRs.

### PR 1 — `feat/147-01-activity-restore-api`

- [x] T1 — Migration `0013` allowing the `restore` audit operation. `POST /admin/events/:eventId/activities/:activityId/restore`: admin + CSRF, `expectedVersion`, audited in the same transaction, version++, 409 when not archived or stale, 409 when placement no longer fits (D3). Contract doc rows for activities. PostgreSQL e2e.

### PR 2 — `feat/147-02-pass-type-restore-api`

- [ ] T2 — `POST /admin/events/:eventId/pass-types/:passTypeId/restore`: same rules, 409 with a clear message when an active pass type uses the name, access links kept (D1). Contract doc rows and rules ("archived and restorable, never deleted"). PostgreSQL e2e including the name conflict and kept links.

### PR 3 — `feat/147-03-activity-restore-ui`

- [ ] T3 — `restoreActivity` API client; "Restaurar" on archived activity rows with a confirmation dialog; success and failure notices (409 visible). Playwright flows; dialog in the sweeps.

### PR 4 — `feat/147-04-pass-restore-ui`

- [ ] T4 — `restorePassType` API client; "Archivados" section in the pass list with "Restaurar" and a confirmation dialog; name-conflict message that explains how to resolve it; archived pass detail points to Restaurar. Playwright flows; docs.

## Acceptance criteria

See issue #147. Evidence is recorded per task below.

## Progress

- 2026-10-07 — Both product decisions answered (D1, D2). Exploration done (delegated read-only explorer). Feature doc created. Next: T1.
- 2026-10-07 — T1 done in `a1df4a3`: migration `0013_catalog_restore_audit` allows the `restore` audit operation; activity restore endpoint with admin + CSRF, `expectedVersion`, version++, audit in the same transaction; 409 when not archived, stale, or no longer fitting (D3) via a shared `placementProblem()`; pass `Operation` type gains `restore`. Contract doc updated for activities. RED 7 failing, then GREEN 18/18 in `admin-activity-catalog.e2e-spec.ts`. Checks: backend lint, unit 35/35, build, full e2e 125/125 (after bumping the migration count in `event-activity-foundation.e2e-spec.ts:198`, done by the parent), format. Note: the FK and the window trigger already protect archived activities, so the D3 409 only fires on drifted data; tests simulate it by disabling them. Review: medium (379 lines), consent granted, reliability lens approved and acknowledged (lineage `review-6e6ce505daf5b2ae`). Advisory only: a suggestion about schema-mutating tests at `admin-activity-catalog.e2e-spec.ts:451-469`. Next: T2.

## Route per task

- T1 — delegated writer (writer trigger: migration, schema, controller, service, e2e); parent made the one-line migration count bump.
