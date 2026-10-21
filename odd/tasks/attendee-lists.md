# Printable attendee lists and paper fallback

## Tracking

- GitHub issue: #65 — Deliver printable attendee lists and paper fallback (MVP delivery slice 4)
- Branch: `feat/65-attendee-lists` → `dev` (base `81e7a90`), one commit per task.

## Goal

An event administrator prints, or saves as PDF from the browser, contact-free lists of an event's attendees grouped by pass and by activity, with each page showing the event and the generation time. The event-day runbook describes the paper fallback: provisional cash and access during an outage, and manual verification after recovery with no automatic sync.

## Decisions

- **Access (2026-10-20):** event administrators only (`authorizeEventAdmin`); judges and other-event sessions get the safe 401 with no data, per slice 4 acceptance criteria.
- **Contact-free response:** the endpoint never returns email, phone, Instagram or birth date; it is enforced in the projection, not hidden in the UI.
- **Who appears (default, 2026-10-20):** `confirmed` and `pending_payment` registrations, each with a visible status; `voided` excluded so a paper row never suggests admitting a voided registration.
- **Groupings, generic (no hardcoded November names):** event-wide (every listed registration), one list per pass type held (ordered full → general → add-on, then name; archived pass types still listed if held), and one list per accessible activity of kind `competition` or `workshop` (matching check-in kinds; `social` excluded). Pass lists show event attendance; activity lists show that activity's attendance.
- **Snapshot:** one unpaginated read returns `generatedAt` from the server; the page prints the current selection.
- **Out of scope:** CSV/Excel, offline sync or replay, an "after outage" audit marker (slice 5), printer and venue distribution (procedure, left open in the runbook).

## Tasks

- [ ] 1. Backend: `GET /admin/events/:eventId/attendee-lists` (event admin, no CSRF for reads) returns the event name, `generatedAt`, the pass types and activities to group by, and contact-free rows (registration id, folio, full name, AKA, status, event check-in time, held passes, accessible competition/workshop activities with their check-in time). PostgreSQL e2e first, including no contact fields in the body, judge and wrong-event 401, voided excluded.
- [ ] 2. Frontend: route `/admin/events/:eventId/lists`, enable the "Listas de respaldo" nav entry, a page with a list selector and a print action, print styles that hide the shell and repeat the event and generation time on each printed page. Grouping and labels in a model with Vitest; Playwright for the flow, denial and print layout markers.
- [ ] 3. Docs: new contract `docs/contracts/attendee-lists.md`, `runbooks/event-day.md` (printing ahead, provisional cash and access, post-recovery checklist), `product/november-2026-mvp-delivery-slices.md` slice 4 delivered, `frontend-architecture.md`.

## Evidence

- Exploration on 2026-10-20: pass types `event_pass_types` with `pass_class` full/general/add_on (`schema/event-catalog.ts:18-59`); held passes `event_registration_passes`, selections `event_registration_pass_selections`; activities `kind` competition/workshop/social (`schema/activities.ts:20`); registrations `status` pending_payment/confirmed/voided (`schema/registrations.ts:44-47`); AKA is `participants.stage_name`, the same table holds email/phone/instagram/birth date. Attendance: `event_check_ins` (one per registration) and `activity_check_ins` (`schema/check-ins.ts`). Per-person access: `RegistrationEntitlementsService.accessibleActivityIdsByRegistration` (`registration-entitlements.service.ts:74-127`); check-in kinds `CHECK_IN_KINDS` (`registration-search.service.ts:19`). November seed: one full pass type per discipline, general entry, Open Styles as an add-on including the Open Styles activity (`catalog-seed/november-catalog.ts:87-107`). No `@media print` or `print:` usage in the frontend; side nav already has a "Listas de respaldo" placeholder (`widgets/admin-shell/ui/admin-side-nav.tsx:16`).
- Found while exploring (out of scope, pre-existing): `GET /admin/events/:eventId/participants` uses `EventFoundationGuard` → `authorizeEvent` (`session-access.service.ts:153`), which admits judges in scope, and returns email; `admin-registration-operations.md:77` requires an administrator, not a judge.
