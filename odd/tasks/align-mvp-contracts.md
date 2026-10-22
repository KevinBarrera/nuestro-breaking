# Align MVP contracts and docs with confirmed organizer decisions

## Tracking

- GitHub issue: #127
- Branch: `docs/127-align-mvp-contracts` → `dev` (base `0c0609d`), one commit per task.

## Goal

No contract describes the approved MVP scope as a draft pending validation, contracts still mark unimplemented behavior as proposed, and the browser version of the MVP proposal matches the Markdown proposal.

## Decisions

- **Proposal HTML (2026-10-21, revised):** the client-facing proposal is published from the separate public repo `KevinBarrera/november-2026-mvp-proposal` at https://kevinbarrera.github.io/november-2026-mvp-proposal/. Retire `docs/product/november-2026-mvp-proposal.html` and point its links in `docs/README.md` and `openspec/README.md` to the published page; the Markdown stays as the internal source. The published page is not changed by this issue. (Replaces the earlier "refresh" choice, made before the published page was considered.)
- **Already resolved, only recorded:** `operational-check-in.md` (#126) and the cash-correction wording in the audit policy (#104, PR #305).
- The Markdown proposal states "alcance general del MVP aprobado; detalles operativos pendientes de confirmar"; contracts follow that wording.

## Tasks

- [x] 1. Contracts: remove the "DRAFT pending organizer validation" status from `admin-registration-audit-policy.md:3`, `admin-registration-operations.md:3,162` and `event-activity-api-boundary.md:122`, describing the proposal as approved in general scope; rewrite `admin-registration-operations.md:3` so it no longer says it is not an implementation; keep anything still unimplemented marked as proposed; update "Known contract and document mismatches" in `product/november-2026-mvp-delivery-slices.md`.
- [x] 2. Proposal HTML: delete `docs/product/november-2026-mvp-proposal.html`, point the links in `docs/README.md` and `openspec/README.md` to the published page, and mark the mismatch resolved in `product/november-2026-mvp-delivery-slices.md`.

## Evidence

- Exploration on 2026-10-21: DRAFT wording at `docs/contracts/admin-registration-audit-policy.md:3`, `admin-registration-operations.md:3,162`, `event-activity-api-boundary.md:122`; mismatch list `docs/product/november-2026-mvp-delivery-slices.md:382-389`; proposal Markdown last changed `6ba74ee` (2026-10-08), HTML last changed `42f8e49` (2026-10-05); HTML linked from `docs/README.md:13` and `openspec/README.md:12`. Historical briefs (`november-2026-preliminary-pilot-brief.md`, `current-state-stabilization-plan.md`) are intentionally marked DRAFT/historical and stay unchanged.
- Task 1 (2026-10-21): removed the DRAFT status from `admin-registration-audit-policy.md:3`, `admin-registration-operations.md:3,162` and `event-activity-api-boundary.md:122`, now "general MVP scope approved; operational details still to confirm with the organizers". `admin-registration-operations.md`: line 3 lists the delivered commands; "Proposed operations" → "Operations"; search paging points to the frontend architecture; "define safeguards before commands ship" and "define guards for creation and cash recording" now state the delivered guards; the #101 policy reference no longer says it does not implement audit storage; "Organizer decisions required before implementation" → "Organizer decisions"; follow-ups #101, #102 and #105 marked delivered, #104 drops its stale pending-decision dependency, correction screens delivered in #256. Delivery-slices mismatch list: DRAFT item resolved by #127, cash-correction wording resolved by #104 (PR #305), check-in stays resolved by #126, proposal HTML left open for task 2.
- Task 2 on 2026-10-21: deleted `docs/product/november-2026-mvp-proposal.html` (623 lines, last changed `42f8e49`); `docs/README.md` and `openspec/README.md` now link the published client page (https://kevinbarrera.github.io/november-2026-mvp-proposal/, repo `KevinBarrera/november-2026-mvp-proposal`, last `ebffc82` 2026-10-06), noting the Markdown is the internal source and may be newer; the last item of "Known contract and document mismatches" is marked resolved. No other reference to the HTML file remains outside `odd/`. `prettier --check docs openspec` clean.
