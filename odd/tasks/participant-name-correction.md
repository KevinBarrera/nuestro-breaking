# Correct a participant's name or AKA with a reason

## Tracking

- GitHub issues: #104 (second slice: name/AKA correction) and #256 (its UI action)
- Branch: `feat/104-participant-correction` → `dev` (base `d956a7d`), one commit per task.

## Goal

An administrator corrects the name parts and the AKA of the participant on a registration, giving a mandatory reason. When the same person (email or phone) has registrations in other events, the server reports how many and requires explicit confirmation; those other events never change. The change and a redacted `registration_correction` audit fact are written in one transaction.

## Decisions

- **Identity (2026-10-21):** there is no participant identity shared across events; each registration owns its participant row (`manual-registration.service.ts:114-127`, `public-registration.service.ts:134-137`). The correction updates only this registration's participant, matching the confirmed "no automatic propagation across events" decision. The cross-event warning is informational.
- **Cross-event count:** other events where a non-voided registration's participant matches by `lower(btrim(email))` or `phoneMatchKey(phone)` (the existing duplicate rule, with `event_id <> current`). Only the count is returned, never foreign data. When it is above 0 the write requires `confirmCrossEvent: true`; otherwise it is rejected with 409 `cross_event_confirmation_required` and `otherEventCount`, like the `possible_duplicates` confirmation of manual registration.
- **Fields:** first name, first last name (required, 1 to 100 after trimming), second last name and AKA (optional, up to 100; blank clears). `full_name` is rebuilt with `buildFullName`, as at creation. No other participant field changes.
- **Reason:** mandatory, 1 to 500 characters after trimming, stored in the audit `note`, as in #170 and the void.
- **Lifecycle:** allowed on `pending_payment` and `confirmed`, online or in person; `voided` is rejected with 409. A request that changes nothing is rejected with 400.
- **Audit redaction:** `registration_correction`, admin actor, no amount; `facts` holds `{ changedFields, otherEventCount, crossEventConfirmed }`; states carry status and participant id, never names.
- **Out of scope:** discipline swap, cash correction, correction history view, editing email, phone or other participant data, propagation to other events.

## Tasks

- [x] 1. Backend: migration `0034` adds `registration_correction` to the audit operation types (bump the migration count in `test/event-activity-foundation.e2e-spec.ts:198` to 35 and the type lists in `admin-registration-entitlements.e2e-spec.ts` and `registration-audit-actor.e2e-spec.ts`); an admin + CSRF, event-scoped route in `registration-entitlements` corrects the participant under the registration lock, computes the cross-event count, writes the audit fact and returns the entitlements body; rejects invalid fields, missing reason, no changes, voided registrations and unconfirmed cross-event impact. PostgreSQL e2e first.
- [ ] 2. Frontend: the correction API in `entities/admin-registration`, a "Corregir nombre o AKA" card on the admin registration page (pending and confirmed) with the reason, the cross-event warning dialog after the 409, failure messages in a model with Vitest, and Playwright for a correction, a missing reason and the cross-event confirmation.
- [ ] 3. Docs: `admin-registration-audit-policy.md`, `admin-registration-operations.md`, `event-catalog.md`, `frontend-architecture.md`, `runbooks/event-day.md`, Slice 5 note in `product/november-2026-mvp-delivery-slices.md`.

## Evidence

- Exploration on 2026-10-21: participant columns and checks `schema/participants.ts:10-43` (name parts ≤ 100 and not blank, first name and first last name both set or both null; `stage_name` unchecked); `buildFullName` `participant-profile/participant-normalization.ts:31`; duplicate match rule `manual-registration.service.ts:349-353`; no name snapshot outside `participants`. Void template: controller `registration-entitlements.controller.ts:110-123`, `requiredReason` `:58-63`; service `voidRegistration` `:375-418`, `lockRegistration` `:421-435`, `summary()` `:465-493`, `audit()` `:555-578`. Audit check `schema/registration-operation-audit.ts:53-56`; last migration `drizzle/0033_registration_void_audit.sql`. Frontend template: `pages/admin/ui/registration-void.tsx`, `registration-void-model.ts`, `entities/admin-registration/api/registration-api.ts:224-234`, `participant-form.ts:64-137` limits and messages, `e2e/admin-registration-void.spec.ts`.
- Task 1 on 2026-10-21 (`68c1354`): migration `0034_registration_correction_audit.sql` (journal entry only, as 0033) adds `registration_correction`. `POST /admin/events/:eventId/registrations/:registrationId/participant-correction` (200, admin + CSRF) takes `{ firstName, firstLastName, secondLastName?, stageName?, reason, confirmCrossEvent? }`; the body replaces all four parts (absent, null or blank optional parts clear), each trimmed with inner whitespace collapsed before the 100 bound. Rejections in order: 400 `{ message: 'Invalid participant correction', fieldErrors }` (`required`, `invalid`, `too_long`, `unknown_field`, non-boolean `confirmCrossEvent`) before the lock; 404 missing or other-event registration; 400 `correction_reason_required`; 409 `registration_voided`; 400 `correction_no_changes`; 409 `cross_event_confirmation_required` with `otherEventCount` unless `confirmCrossEvent: true`. The count uses the duplicate rule now exported as `participantContactMatch` (`manual-registration.service.ts`), where a null email or phone never matches. Audit: admin actor, no amount, `note` = reason, `affected_activity_ids` `[]`, before/after `{ status, participantId }`, `facts` `{ changedFields, otherEventCount, crossEventConfirmed }`; the response is the entitlements body. RED: 10 failed / 41 passed in the three touched specs; GREEN: 51/51, backend `test` 614/614, `test:e2e` 483/483, lint and build clean.
