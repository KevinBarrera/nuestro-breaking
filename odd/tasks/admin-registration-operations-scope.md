# Admin registration operations scope

## Tracking

- GitHub issue: #63 — Prepare admin registration operations scope
- Branch: `chore/63-admin-registration-operations-scope`
- Follows: #57 MVP epic, #61 registration lifecycle states, #62 participant registration model, and admin auth foundation work.

## Goal

Prepare the MVP admin registration operations scope before implementation so admin search, manual registration, cash confirmation, corrections, and auditability can be delivered as focused follow-up slices.

## Tasks

- [x] Map current admin auth, participant registration, registration lifecycle, MVP proposal, and related issue context.
- [x] Define the smallest admin registration operations contract with permission assumptions, auditability rules, and explicit exclusions.
- [x] Decompose admin operations into follow-up implementation issues.
- [x] Verify documentation updates with focused checks.
- [x] Prepare work-unit summary for maintainer review.

## Constraints

- Preserve the November 2026 MVP proposal as DRAFT pending organizer validation.
- Do not implement admin registration APIs, UI, search, cash handling, correction commands, payment provider integration, check-in, exports, or role administration in this slice.
- Keep payment confirmation source semantics aligned with #61: registration confirmation requires an explicit trusted source, not a payment redirect.
- Preserve admin access assumptions from the admin auth boundary; do not invent public or fake frontend auth.
- Cash registration and corrections must remain auditable in future implementation slices.

## Evidence

- Initial issue #63 acceptance criteria require decomposed implementation issues, explicit permission assumptions, and auditable cash/correction flows.
- Scoped mapping: the MVP proposal remains DRAFT pending organizer validation; #62 persists participant/event/activity registrations and lookup fields, #61 persists `pending_payment`/`confirmed`/`voided` and `approved_payment`/`admin_cash` but does not authorize or audit transitions. The admin auth boundary defines scoped server sessions and auth audit; recent admin auth slices implement the foundation, but they do not provide registration-operation audit.
- `docs/contracts/admin-registration-operations.md` defines event-scoped roster lookup, manual registration, explicit cash confirmation, and controlled correction/voiding; it requires server-side permission checks and atomic durable operation audit before success. Organizer choices on fields, cash/correction authority, receipts, correction rules, and audit retention/access remain open.
- Proposed implementation issue order: #101 audit facts/correction policy; #102 event-scoped search; #103 authorized manual registration and cash recording; #104 audited correction; #105 operations UI. The contract names dependencies and excludes payment-provider work, reconciliation/refunds, check-in, exports, offline sync, general role administration, and legal/tax claims.
- GitHub issues created after duplicate searches: #101, #102, #103, #104, and #105. Existing #63 was the only duplicate-adjacent result for manual cash/correction searches, so the follow-up issues were created as decomposed children rather than duplicates.
- Issue #63 body was updated to mark its acceptance criteria complete and link the scope contract plus follow-up issues. The issue remains open pending branch delivery/merge.
- `docs/README.md` links the new contract under reusable references; this slice makes no API, UI, or persistence changes.
- `corepack pnpm format:check` initially failed on the new contract's table formatting; after changing that section to a list, the check passed. Node engine warning: repository requests 24.18.1; runner used 24.19.0.
