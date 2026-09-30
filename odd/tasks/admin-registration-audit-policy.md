# Admin registration audit and correction policy

## Tracking

- GitHub issue: #101 — Define audit facts and correction policy for admin registration changes
- Branch: `docs/101-admin-registration-audit-policy`
- Follows: #63 admin registration operations scope, #61 registration lifecycle states, #62 participant registration model, and admin auth boundary work.

## Goal

Define the durable operation-audit facts and correction/voiding policy needed before admin registration write workflows are implemented.

## Tasks

- [x] Map current admin registration scope, lifecycle, participant model, and admin auth context.
- [x] Define the registration operation audit contract.
- [x] Define correction and voiding policy boundaries.
- [x] Record unresolved organizer/product decisions and follow-up blockers.
- [x] Verify documentation updates with focused checks.
- [x] Prepare delivery summary for maintainer review.

## Constraints

- Do not implement admin registration APIs, UI, database migrations, commands, payment handling, check-in, exports, or role administration in this slice.
- Preserve the November 2026 MVP proposal as DRAFT pending organizer validation.
- Keep operation audit separate from admin authentication audit.
- Require atomic registration mutation plus operation audit before reporting success.
- Do not silently overwrite confirmed registration facts, invent refund semantics, or loosen event-scoped authorization.

## Evidence

- Issue #101 requires audit facts for manual registration, cash confirmation, correction, and voiding; allowed/rejected correction rules; explicit atomic write behavior; and unresolved organizer decisions recorded as blockers or follow-ups.
- `docs/contracts/admin-registration-operations.md` already establishes the parent scope and follow-up issue order: #101 before #103/#104 commands, while #102 search can proceed separately.
- #61 added lifecycle states (`pending_payment`, `confirmed`, `voided`) and confirmation sources (`approved_payment`, `admin_cash`) as persistence invariants only; it did not define actor authority, transition history, operation audit, refunds, or check-in behavior.
- #62 added participant, event registration, and activity registration persistence for future lookup and enrollment; it intentionally avoided organizer-required-field, workflow, payment, and audit policy.
- Admin auth boundary supplies session/event authorization concepts and auth audit, but registration business changes need their own operation audit.
- `docs/contracts/admin-registration-audit-policy.md` defines an append-only, redacted operation fact for each write type, transaction-level audit atomicity, pending-only correction and voiding defaults, and explicit blockers for confirmed voids, shared participant edits, cash evidence, authority, readers, and retention. These are future-command requirements, not implemented behavior.
- `corepack pnpm format:check` and `git diff --check` passed after the contract and navigation updates; the task checklist was then marked verified.
- Independent read-only verifier passed the documentation implementation for #101 with no blocking findings.
- Work-unit commit: `5f5f8c1` (`docs(admin): define registration audit policy`).
