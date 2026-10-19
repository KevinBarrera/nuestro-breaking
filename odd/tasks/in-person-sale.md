# In-person sale UI

## Tracking

- GitHub issue: #105 — Add admin registration operations UI
- Chained PRs, merged bottom-up into `dev`:
  1. `feat/105-01-admin-registration-api`
  2. `feat/105-02-participant-form-model`
  3. `feat/105-03-sale-registration-step`
  4. `feat/105-04-registration-summary-api`
  5. `feat/105-05-sale-pass-and-cash-steps`
- Follows: #102 search, #103 manual registration and cash, #124 entitlements, #125 duplicates and cash receipt, #257 design system.

## Goal

An event administrator sells a pass in person on event day: search the event's registrations, register a new participant (confirming possible duplicates), assign passes and competitions, and confirm the cash payment with the paper receipt number. Every outcome comes from the backend; the UI holds no authority.

## Decisions (product owner, 2026-10-16)

- **Cash amount:** computed by the UI as the sum of the held passes' `priceCents`, read-only; the operator only confirms it. No service charge on cash.
- **Phone:** international numbers are allowed. The default stays `+52` with 10 digits; another country takes a full international number (10 to 15 digits, as the backend validates).
- **Possible duplicates:** the dialog shows the masked matches. A `pending_payment` match can be opened to continue the sale on it; otherwise the operator confirms and a new registration is created.
- **Email is required** (#58, `admin-registration-operations.md:27`). `november-2026-online-purchase-plan.md:20` is stale and gets fixed in PR 4.
- **Adding a pass asks for confirmation** (product owner, 2026-10-19): no endpoint removes a pass until #256, so the dialog names the pass and its price and says it cannot be removed from this screen.

## Technical decisions

- Manual registration never sends `activityIds`; passes and competitions go through the entitlements endpoints.
- A sale interrupted after the create leaves a `pending_payment` registration; the operator resumes it from search.
- Search admits judges in the backend while the contract says administrators only: follow-up issue, not part of #105.
- Corrections and voiding stay in #256.

## Tasks

- [x] 1. Add the `entities/admin-registration` API (search, manual create, passes, selections, entitlements, cash confirmation) with runtime readers, typed failures and Vitest coverage. (35 Vitest tests; frontend suite 431 passed, lint and build pass.)
- [x] 2. Share the participant form model between the public purchase and the admin sale, with admin copy and international phone support, covered by Vitest. (Behavioral RED of 16 assertions; frontend suite 449 passed, lint and build pass.)
- [x] 3. Add the "Inscripciones" route and screen: search, new registration form and the possible-duplicates dialog, with Playwright coverage. (Frontend suite 470 passed; Playwright: 37 in the flow specs and 107 in the accessibility and phone-width sweeps; lint and build pass.)
- [x] 4a. Add a registration summary (participant name, status, folio) to the entitlements read and writes, with the contract, backend e2e and the frontend reader. (Product owner, 2026-10-16: the sale screen must survive a reload on event day.) Backend e2e: 13/13 entitlements, 436 in the full run; backend unit 596; frontend 472 Vitest, 15 Playwright flows, 107 sweeps.
- [ ] 4. Add pass and competition selection, read-only cash confirmation with the receipt number, and resuming a pending registration; Playwright coverage, accessibility and phone-width sweeps, docs. Branch `feat/105-05-sale-pass-and-cash-steps` from 1426ee0, one commit per step:
  - [x] 4.1 Pass picker with disabled reasons and the add-pass confirmation dialog; Vitest for the picker model, Playwright flow. (RED 12/12 on assertions, then GREEN; frontend 484 Vitest, 17 Playwright in the registration specs, lint and build pass. The screen now reads name and status from the entitlements summary. Commit 3f4fdb9; RDD review-84734107f0e1e1af approved and acknowledged.)
  - [x] 4.2 Competitions per held pass (PUT replaces the list); Vitest and Playwright. (RED 13/15 on assertions, then GREEN; frontend 499 Vitest, 19 Playwright in the registration specs, lint and build pass. Saved selections that are no longer valid show as unavailable and block saving. The backend still lets a confirmed registration change selections; the screen allows it only while pending.)
  - [x] 4.3 Cash confirmation (read-only total, receipt 1–50 chars, optional note, confirmation dialog), status-driven screen (pending, confirmed, voided), `receipt_taken` inline, unknown outcome shows "Recargar" without auto-retry; Vitest and Playwright. (RED 19/20 on assertions, then GREEN; frontend 519 Vitest, 23 Playwright in the registration specs, lint and build pass. The confirm response carries status and folio but no entitlements, so the screen applies them without a re-read. The backend does not check that the amount matches the passes, or that any pass is held; a $0 total disables cash. Commit 1fe00c6, RDD review-56e1f00fc5b6c5be approved; its WARNING (two clicks in one task sent two cash POSTs) is fixed with a ref guard and a Playwright regression test, RED 2 POSTs then GREEN 5/5.)
  - [ ] 4.4 Resume a pending registration from search; accessibility and phone-width sweeps. Also cover the RDD advisories from 4.1: a Playwright flow for the pass-types load failure (`sale-pass-picker.tsx:103-111`), and a visible signal while the screen reloads (`admin-registration-page.tsx:59-81`). Same for the activities load failure from 4.2.
  - [ ] 4.5 Docs: frontend-architecture, event-day runbook "Venta en el lugar", fix `november-2026-online-purchase-plan.md:20`.
- [x] 5. Open the follow-up issue for judges reaching search. (#262, `status:needs-decision`: check-in also calls search, so judge access must be decided first.)

## Evidence

- Exploration report: Engram `issue-105/in-person-sale-map`.
- Task 1: most pass and selection rules have no backend `code`, so the client maps them by exact message; a reworded backend message degrades to `error`. Engram `frontend/admin-registration-api`.
- Task 2: `buyer-form.ts` is a wrapper over `entities/participant` with unchanged exports and messages. An international `+52…` number is sent as `+52…` digits, and the backend's `phoneMatchKey` matches it to the national form (read, not tested).
- Task 3: the entitlements read has no participant name or status, so the registration screen takes them from the navigation state and loses them on reload. Task 4 must handle that. Server field errors reuse `saleParticipantMessages`. About 1,000 production lines: consider splitting PR 3 when opening it.
