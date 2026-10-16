# In-person sale UI

## Tracking

- GitHub issue: #105 — Add admin registration operations UI
- Chained PRs, merged bottom-up into `dev`:
  1. `feat/105-01-admin-registration-api`
  2. `feat/105-02-participant-form-model`
  3. `feat/105-03-sale-registration-step`
  4. `feat/105-04-sale-pass-and-cash-steps`
- Follows: #102 search, #103 manual registration and cash, #124 entitlements, #125 duplicates and cash receipt, #257 design system.

## Goal

An event administrator sells a pass in person on event day: search the event's registrations, register a new participant (confirming possible duplicates), assign passes and competitions, and confirm the cash payment with the paper receipt number. Every outcome comes from the backend; the UI holds no authority.

## Decisions (product owner, 2026-10-16)

- **Cash amount:** computed by the UI as the sum of the held passes' `priceCents`, read-only; the operator only confirms it. No service charge on cash.
- **Phone:** international numbers are allowed. The default stays `+52` with 10 digits; another country takes a full international number (10 to 15 digits, as the backend validates).
- **Possible duplicates:** the dialog shows the masked matches. A `pending_payment` match can be opened to continue the sale on it; otherwise the operator confirms and a new registration is created.
- **Email is required** (#58, `admin-registration-operations.md:27`). `november-2026-online-purchase-plan.md:20` is stale and gets fixed in PR 4.

## Technical decisions

- Manual registration never sends `activityIds`; passes and competitions go through the entitlements endpoints.
- A sale interrupted after the create leaves a `pending_payment` registration; the operator resumes it from search.
- Search admits judges in the backend while the contract says administrators only: follow-up issue, not part of #105.
- Corrections and voiding stay in #256.

## Tasks

- [x] 1. Add the `entities/admin-registration` API (search, manual create, passes, selections, entitlements, cash confirmation) with runtime readers, typed failures and Vitest coverage. (35 Vitest tests; frontend suite 431 passed, lint and build pass.)
- [ ] 2. Share the participant form model between the public purchase and the admin sale, with admin copy and international phone support, covered by Vitest.
- [ ] 3. Add the "Inscripciones" route and screen: search, new registration form and the possible-duplicates dialog, with Playwright coverage.
- [ ] 4. Add pass and competition selection, read-only cash confirmation with the receipt number, and resuming a pending registration; Playwright coverage, accessibility and phone-width sweeps, docs.
- [x] 5. Open the follow-up issue for judges reaching search. (#262, `status:needs-decision`: check-in also calls search, so judge access must be decided first.)

## Evidence

- Exploration report: Engram `issue-105/in-person-sale-map`.
- Task 1: most pass and selection rules have no backend `code`, so the client maps them by exact message; a reworded backend message degrades to `error`. Engram `frontend/admin-registration-api`.
