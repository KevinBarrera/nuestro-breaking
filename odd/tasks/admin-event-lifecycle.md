# Admin event lifecycle — issue #213

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/213 (source of truth for scope and acceptance criteria)
- Design: https://claude.ai/artifact/WgBWzUUE1HSQcfbqhoJVot (event list with Crear evento, first-run empty state, Nuevo evento, Datos del evento, Archivar evento, Eliminar un evento vacío). The top navigation bar in the design is out of scope (D3).
- Engram mirror: `odd/admin-event-lifecycle/tasks`
- Base: `dev` at `044ffeb` (#219 merged)
- Delivery strategy: stacked to `dev`, one PR per slice, same as #214. `Refs #213` on each PR, `Closes #213` on the last one, no `Co-Authored-By`.
- Forecast: about 2,500 authored lines. Slice 1 is T1 and T2 (foundation and create), slice 2 is T3 to T6 (edit, archive, restore, delete, docs), slice 3 is T7 to T10 (frontend).
- Slice branches: `feat/213-01-event-admin-foundation`, `feat/213-02-event-admin-lifecycle`, `feat/213-03-event-admin-frontend`.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `044ffeb`. Review consent is granted without asking when RDD says a review is due on a finished task (user instruction).

## Objective

Administrators create, edit, archive, restore and delete empty events from the admin panel, so a clean environment can be set up without a developer running scripts.

## Current state (explored 2026-10-12)

- Nothing for #213 exists yet: no `archived_at`, no `POST`/`PATCH /admin/events`, no event-level audit, no create or Archivados UI.
- `events` (`apps/backend/src/database/schema/events.ts`) already checks slug format and uniqueness, folio prefix format, non-blank name, and paired start/end dates. The backend has no time zone validation.
- `organizations` is only id and name; only the local seed creates one. An empty database has no organization.
- `event_catalog_audit` accepts only `activity` and `pass_type`, is append-only by trigger, and has a foreign key to `events`, so it cannot hold event actions or survive a delete. Sales changes are not audited today.
- Tables referencing `events` (all `ON DELETE NO ACTION`): `event_catalog_audit`, `event_venues`, `event_pass_types`, `event_registrations`, `registration_operation_audit`. Activities and check-ins link through venues and registrations. `user_roles.scope_id` has no foreign key.
- Public reads go through `PublicCatalogService.event()` (`events/public-catalog/public-catalog.service.ts`): `catalog()`, `requireOpen()` (registration and checkout) and `requireEvent()` (payment status). The Mercado Pago webhook and `confirmRegistration` never read the event's sales or archive state.
- Guards: `authorizeGlobalAdmin(Mutation)` and `authorizeEventAdmin(Mutation)` in `identity-access/session-access.service.ts`; both return `{ userId, sessionId }` for audit.
- Migrations are hand-written SQL plus a `drizzle/meta/_journal.json` entry; the next one is `0021`.
- Frontend: event list in `pages/admin/ui/admin-page.tsx`, read-only `admin-event-foundation-page.tsx`, side navigation in `widgets/admin-shell`. `entities/admin-team` is the freshest API slice pattern.

## Decisions

- D1 (user, 2026-10-12) — A new event belongs to the single organization. If none exists, the backend creates it with the first event. Technical default: if more than one organization exists, creating an event is refused with `409 { code: "organization_ambiguous" }` until a later issue adds a choice.
- D2 (user, 2026-10-12) — "Fundamentos del evento" becomes "Datos del evento": same route and side navigation item, now editable, with locked slug and folio prefix and the "Archivar o eliminar" section. No duplicate page.
- D3 (user, 2026-10-12) — Keep the current side navigation. The design's top navigation bar is not implemented and gets no issue.
- D4 (technical default) — A new append-only `event_admin_audit` table records `created`, `updated`, `archived`, `restored` and `deleted` with actor user and session and JSON details. `event_id` has no foreign key and the row keeps the slug and name, so the `deleted` row survives the event.
- D5 (technical default) — The backend validates time zones as IANA names with `Intl`.
- D6 (technical default) — Archiving sets `archived_at` and turns online sales off. The public catalog, registration and checkout treat an archived event as not found; payment status (`requireEvent`) keeps working so buyers can follow up. The webhook stays unchanged. Restoring clears `archived_at` and leaves sales off.
- D7 (technical default) — An event is empty when it has no activities, pass types, registrations, check-ins or catalog audit rows. Deleting removes its venues and its event-scoped `user_roles`, and frees the slug. Any other event gets `409 { code: "event_not_empty" }`.

## Tasks

- [x] T1 — Backend foundation: migration `0021` with `events.archived_at` and `event_admin_audit`, Drizzle schema, shared event input parsing (name, slug, folio prefix, IANA time zone, paired dates) reusing the existing patterns, and the organization resolver (D1). Route: delegated (several non-trivial files).
- [ ] T2 — Create and read: `POST /admin/events` (global admins; sales off; taken slug gives a field error; audited `created`); `GET /admin/events` and `GET /admin/events/:eventId/foundation` expose slug, folio prefix and archived state, and the list can include archived events. Route: delegated.
- [ ] T3 — Edit: `PATCH /admin/events/:eventId` for global or event-scoped admins; only name, time zone and dates; slug and folio prefix refused; audited `updated`. Route: delegated.
- [ ] T4 — Archive and restore: global admins only; archive closes sales and hides the event from public catalog, registration and checkout (D6); restore leaves sales closed; a late Mercado Pago confirmation is still recorded (e2e); both audited. Route: delegated.
- [ ] T5 — Delete empty events: global admins only; refuse non-empty events (D7); remove setup rows and free the slug; audited `deleted`. Route: delegated.
- [ ] T6 — Contract docs and admin runbook for the new endpoints and flow. Route: delegated with T5.
- [ ] T7 — Frontend events API slice; event list with Crear evento (global admins), first-run empty state and Archivados toggle. Route: delegated.
- [ ] T8 — Nuevo evento form with slug suggested from the name and live URL and sample folio preview. Route: delegated.
- [ ] T9 — Datos del evento page replacing Fundamentos (D2): editable name, time zone and dates; locked slug and folio prefix. Route: delegated.
- [ ] T10 — Archivar o eliminar section, Archivar evento dialog, Eliminar un evento vacío dialog (type the slug), restore from Archivados; `docs/frontend-architecture.md`. Route: delegated.

## Acceptance criteria

See issue #213. Summary: a global admin sets up an event from an empty database without scripts; bad slug or prefix gives a field error and creates nothing; event-scoped admins edit but cannot create; slug and prefix are immutable; archive closes sales and hides the event while data stays readable; restore keeps sales closed; late payment confirmations are recorded; only empty events can be deleted after typing the slug; every action is audited; docs describe the flow.

## Checks

- Backend: `pnpm --filter @nuestro-breaking/backend lint`, `test`, `test:e2e`.
- Frontend: `pnpm verify:pr`.

## Progress

- 2026-10-12: Explored; D1, D2 and D3 decided by the user; branch `feat/213-01-event-admin-foundation` created.
- 2026-10-12: T1 done in `63d46d2` (route: delegated). Migration `0021` adds `events.archived_at` and the append-only `event_admin_audit` (no foreign key to `events`, actor user and session required, trigger blocks UPDATE and DELETE). `src/events/admin-events/admin-event-input.ts` parses create and update bodies (`immutable` field error for slug and folio prefix; `eventWindowErrors` checks merged dates in T3); `src/events/shared/event-slug.ts` now holds the slug rule used by the public catalog; `event-organization.ts` resolves the single organization under advisory lock `213_000_001`. RED: the input spec failed on the missing module; GREEN: 37 tests pass. The concurrent-create e2e fails when the lock is removed. Checks: backend lint clean, unit 454/454, e2e 310/310 (32 suites), `tsc --noEmit` clean, `pnpm format` clean.

## Next step

T2 — create and read endpoints.
