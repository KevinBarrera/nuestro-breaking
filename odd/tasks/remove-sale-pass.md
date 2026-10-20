# Remove a sale pass before payment

## Tracking

- GitHub issue: #282 — Let an administrator remove a pass from an in-person sale before payment
- Branch: `feat/282-remove-sale-pass` → `dev` (base `be568ab`), one commit per task. Split into chained PRs: #283 `feat/282-01-remove-pass-backend` (task 1 and the `code` commit) → `dev`, and #284 `feat/282-02-remove-pass-screen` (task 2 frontend and task 3) → #283.

## Goal

An administrator removes a pass added by mistake to an in-person registration that is still pending payment. The pass and its selections go away in one transaction with a `pass_removal` audit fact, and the sale screen offers "Quitar" per held pass with a confirmation dialog.

## Decisions

- **Reason (2026-10-20):** not required, like adding a pass. The audit fact keeps the actor, time and the removed pass with its price and selections.
- **Online pending registrations (2026-10-20):** excluded. Only registrations without `expires_at` (admin in-person) can lose a pass; others are rejected with a stable code.
- **Dependent add-ons (2026-10-20):** removing a pass whose class a held add-on requires (`requiresPassClass`) is rejected, naming the add-on to remove first. No cascade. Another held pass of the same class still satisfies the add-on.
- **Out of scope:** confirmed registrations (#104, #256), refunds, online checkouts, pass exchange.

## Tasks

- [x] 1. Backend: migration `0032` adds `pass_removal` to the audit operation types; `DELETE …/registrations/:registrationId/passes/:registrationPassId` (admin + CSRF, event-scoped) removes the pass and its selections under the registration lock and writes the audit fact; rejects confirmed, voided and online pending registrations, foreign passes and dependent add-ons. PostgreSQL e2e first.
- [x] 2. Frontend: `removePass` in `entities/admin-registration`, a "Quitar" action per held pass in the sale view with the shared confirmation dialog, failure messages in a model with Vitest, Playwright for remove, a rejected removal and the dependent add-on message. Drop the removed pass's competition draft.
- [x] 3. Docs: `admin-registration-audit-policy.md`, `admin-registration-operations.md`, `event-catalog.md` if the entitlement contract lists routes, `frontend-architecture.md`, `runbooks/event-day.md` step 3.

## Evidence

- Exploration on 2026-10-20: `registration-entitlements.controller.ts` exposes only `POST …/passes` and `PUT …/selections`. `addPass` (`registration-entitlements.service.ts:154`) locks the registration, accepts any `pending_payment` (online included) and enforces `requiresPassClass` (`:192-194`). In-person registrations have no `expires_at`, so the expiry sweeper never matches them (`registration-expiry/expire-registrations.ts:19-22`). Audit operation types are a CHECK list in `schema/registration-operation-audit.ts:55`. Last migration: `0031_activity_kind_list.sql`. Backend e2e: `test/admin-registration-entitlements.e2e-spec.ts`.
- Task 1 on 2026-10-20: RED entitlements and audit-actor e2e 6 failed / 18 passed (route 404, CHECK rejected `pass_removal`) and `pass-class-rules` unit 2 failed; GREEN 24/24 and 9/9, backend unit 604/604, full e2e 461/462 with the migration count in `event-activity-foundation.e2e-spec.ts:198` bumped from 32 to 33 (then 15/15). Contract: `DELETE /admin/events/:eventId/registrations/:registrationId/passes/:registrationPassId`, 200 with the entitlements body. Rejections in order: 404 `Registration not found`; 409 `Registration is not pending payment`; 409 `Online registrations cannot lose a pass`; 404 `Registration pass not found`; 409 `Remove «<add-on>» first; it requires this pass` (several names joined with `, ` and `they require`). Selections are deleted before the pass (FK `no action`). Audit: `pass_removal`, no amount, `affected_activity_ids` = removed selections, `before_state.registrationPass` = `{registrationPassId, passTypeId, priceCents, selections}`, `after_state.registrationPass` = null. `passesRequiringRemoved` in `pass-class-rules.ts` only blocks on add-ons requiring the removed pass's class when no other held pass keeps it. Commit: 56473ee; native review approved with no findings (lineage review-3e7adf8f7c61338b).
- Task 2 on 2026-10-20: backend follow-up gives the add-on 409 `code: 'pass_required_by_add_on'` (RED e2e 1 failed, GREEN 16/16). Frontend: `removeRegistrationPass` (name matches `addRegistrationPass`), rule codes `online_registration_pass_locked` and `pass_required_by_add_on`, `sale-pass-removal-model.ts` (`removalBlockers`, hint, confirmation, failures) and `sale-pass-remove.tsx` (render-prop `SalePassRemoval` with `ConfirmDialog` and a `sending` ref). The add dialog no longer says a pass cannot be removed. RED entity Vitest 4 failed and the model module missing; GREEN Vitest 579/579, the five sale specs 32/32, accessibility and phone-width sweeps 127/127, backend unit 604/604. Playwright was written after the UI (the "Quitar" button did not exist before). Commits: 24e1f64 (backend code) and 90568ae (frontend); native review approved as one unit (lineage review-24dfd2811a285b70), one informational suggestion on `confirm()` (a retried removal after a lost answer gets 404, no double effect).
- Task 3 on 2026-10-20: docs only, no native review. `event-catalog.md` (DELETE route, `0032`, audit row), `admin-registration-audit-policy.md` (`pass_removal`), `frontend-architecture.md` (sale "Quitar"), `runbooks/event-day.md` step 3. `admin-registration-operations.md` has no pass routes and is unchanged.
