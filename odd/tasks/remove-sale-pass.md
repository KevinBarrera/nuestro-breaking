# Remove a sale pass before payment

## Tracking

- GitHub issue: #282 — Let an administrator remove a pass from an in-person sale before payment
- Branch: `feat/282-remove-sale-pass` → `dev`, one commit per task.

## Goal

An administrator removes a pass added by mistake to an in-person registration that is still pending payment. The pass and its selections go away in one transaction with a `pass_removal` audit fact, and the sale screen offers "Quitar" per held pass with a confirmation dialog.

## Decisions

- **Reason (2026-10-20):** not required, like adding a pass. The audit fact keeps the actor, time and the removed pass with its price and selections.
- **Online pending registrations (2026-10-20):** excluded. Only registrations without `expires_at` (admin in-person) can lose a pass; others are rejected with a stable code.
- **Dependent add-ons (2026-10-20):** removing a pass whose class a held add-on requires (`requiresPassClass`) is rejected, naming the add-on to remove first. No cascade. Another held pass of the same class still satisfies the add-on.
- **Out of scope:** confirmed registrations (#104, #256), refunds, online checkouts, pass exchange.

## Tasks

- [ ] 1. Backend: migration `0032` adds `pass_removal` to the audit operation types; `DELETE …/registrations/:registrationId/passes/:registrationPassId` (admin + CSRF, event-scoped) removes the pass and its selections under the registration lock and writes the audit fact; rejects confirmed, voided and online pending registrations, foreign passes and dependent add-ons. PostgreSQL e2e first.
- [ ] 2. Frontend: `removePass` in `entities/admin-registration`, a "Quitar" action per held pass in the sale view with the shared confirmation dialog, failure messages in a model with Vitest, Playwright for remove, a rejected removal and the dependent add-on message. Drop the removed pass's competition draft.
- [ ] 3. Docs: `admin-registration-audit-policy.md`, `admin-registration-operations.md`, `event-catalog.md` if the entitlement contract lists routes, `frontend-architecture.md`, `runbooks/event-day.md` step 3.

## Evidence

- Exploration on 2026-10-20: `registration-entitlements.controller.ts` exposes only `POST …/passes` and `PUT …/selections`. `addPass` (`registration-entitlements.service.ts:154`) locks the registration, accepts any `pending_payment` (online included) and enforces `requiresPassClass` (`:192-194`). In-person registrations have no `expires_at`, so the expiry sweeper never matches them (`registration-expiry/expire-registrations.ts:19-22`). Audit operation types are a CHECK list in `schema/registration-operation-audit.ts:55`. Last migration: `0031_activity_kind_list.sql`. Backend e2e: `test/admin-registration-entitlements.e2e-spec.ts`.
