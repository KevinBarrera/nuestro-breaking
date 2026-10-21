# Void a pending in-person registration with a reason

## Tracking

- GitHub issues: #104 (first slice: justified pending void) and #256 (its UI action)
- Branch: `feat/104-void-pending-registration` → `dev` (base `8353615`), one commit per task.

## Goal

An administrator voids a mistaken in-person registration that is still pending payment, giving a mandatory reason. The status becomes `voided` in one transaction with a `registration_void` audit fact, and the admin registration page offers "Anular inscripción" with a reason dialog.

## Decisions

- **Online pending registrations (2026-10-20):** excluded. Only registrations without `expires_at` (admin in-person) can be voided; online ones keep expiring on their own, so an operator void never leaves a live Mercado Pago checkout behind (a later payment would land as `approved_after_void`). Rejected with a stable code.
- **Reason:** mandatory, 1 to 500 characters after trimming, stored in the audit `note`, as in #170 and #263.
- **Lifecycle:** only `pending_payment` → `voided`. Confirmed and already voided registrations are rejected with 409. `voided` is terminal. Passes and selections stay as history, like expiry.
- **Out of scope:** confirmed/paid voids (escalated outside the MVP), name/AKA and discipline corrections, cash corrections, refunds.

## Tasks

- [ ] 1. Backend: migration `0033` adds `registration_void` to the audit operation types (bump the count in `test/event-activity-foundation.e2e-spec.ts:198` to 34); an admin + CSRF, event-scoped route voids the registration under the registration lock with the reason, writes the audit fact; rejects missing reason, confirmed, voided and online pending registrations. PostgreSQL e2e first.
- [ ] 2. Frontend: `voidRegistration` in `entities/admin-registration`, "Anular inscripción" in the pending mode of the admin registration page (in-person only) with a reason dialog modeled on `DeactivateDialog`, failure messages in a model with Vitest, Playwright for void, a missing reason and a rejected void.
- [ ] 3. Docs: `admin-registration-audit-policy.md` and `admin-registration-operations.md` (route, reason rules, online exclusion), `event-catalog.md` audit row, `frontend-architecture.md`, `runbooks/event-day.md`.

## Evidence

- Exploration on 2026-10-20: the only void path is expiry, which sets `status='voided'` and `updated_at` only (`registration-expiry/expire-registrations.ts:55`) with a `registration_expiry` audit fact (`:58-67`); no `voided_at` or reason column (`schema/registrations.ts:17-35`). Audit CHECK list at `schema/registration-operation-audit.ts:55` lacks `registration_void`; reasons go in `note`. #170 reason pattern: `registration-entitlements.service.ts:323-328,367`, `REASON_MESSAGE` `:47`, parser `registration-entitlements.controller.ts:50-56`. Lock: `lockRegistration` `service.ts:374-387`; online guard model in `removePass` `:236-237`. Late approval only treats `registration_expiry` voids as recoverable (`payments/webhook/late-approval.ts:30-40`); others become `approved_after_void`, already shown in Pagos por revisar (`pages/admin/ui/payments-review-model.ts:27`). Check-in requires `confirmed` (`check-in/check-in.service.ts:119`), so pending registrations have no check-ins. Contract: `admin-registration-audit-policy.md:44,54`, no route or length defined. Frontend: `pages/admin/ui/admin-registration-page.tsx:54,66-71`, `DeactivateDialog` in `team-dialogs.tsx:18-85`, API pattern `entities/admin-registration/api/registration-api.ts:229-232`, error mapping `api/readers.ts:155-186`. Last migration `0032_pass_removal_audit.sql`.
