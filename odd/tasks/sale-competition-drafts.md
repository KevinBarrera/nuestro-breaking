# Sale competition drafts

## Tracking

- GitHub issue: #277 — In-person sale drops unsaved competition choices when another pass is added
- Branch: `fix/277-sale-competition-drafts` → `dev`, one commit per task.

## Goal

During the in-person sale, competitions checked but not yet saved survive any refresh of the registration (such as adding a pass). Confirming cash or a complimentary registration is blocked while any pass has unsaved competition changes. The registration page shows the competitions a pass includes, labeled apart from the selected ones.

## Decisions

- **Unsaved changes at confirmation (2026-10-20):** block. The confirm button stays disabled with a hint naming the passes with unsaved changes; each pass with changes gets "Descartar cambios".
- **Full pass with zero competitions (2026-10-20):** allowed, as today. No rule change in this issue.
- **Draft ownership:** the registration page holds the drafts keyed by `registrationPassId`. A draft exists only after the operator toggles a competition; saving or discarding that pass removes it. A refresh never rewrites a draft.
- **Out of scope:** backend selection rules, check-in (#126), the reason requirement (#170).

## Tasks

- [ ] 1. Keep drafts across entitlements refreshes: lift drafts to the page, Vitest for the draft helpers, Playwright for "add a pass keeps the checked competitions".
- [ ] 2. Block cash and complimentary confirmation while drafts are unsaved, with the hint and "Descartar cambios". Vitest for the unsaved-pass helper, Playwright for blocked, discard and save-then-confirm.
- [ ] 3. Show included competitions on the registration page (confirmed and voided views, and the sale competitions section). Vitest for the mapping, Playwright for the view.
- [ ] 4. Docs: `docs/frontend-architecture.md` (sale section), `docs/runbooks/event-day.md` step on competitions.

## Evidence

- Exploration on 2026-10-20: `sale-competitions.tsx:99-104` resets the draft when the `pass.saved` array reference changes, and every read or write answer brings a new array. Drafts live in `PassCompetitions` local state, so `SaleCash` and `SaleComplimentary` cannot see them. `selectionSummary` (`sale-cash-model.ts:162`) lists only selections; `saleCompetitionPasses` already reads the pass types' `access` links.
