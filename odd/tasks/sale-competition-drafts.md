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

- [x] 1. Keep drafts across entitlements refreshes: lift drafts to the page, Vitest for the draft helpers, Playwright for "add a pass keeps the checked competitions".
- [x] 2. Block cash and complimentary confirmation while drafts are unsaved, with the hint and "Descartar cambios". Vitest for the unsaved-pass helper, Playwright for blocked, discard and save-then-confirm.
- [x] 3. Show included competitions on the registration page (confirmed and voided views, and the sale competitions section). Vitest for the mapping, Playwright for the view.
- [x] 4. Docs: `docs/frontend-architecture.md` (sale section), `docs/runbooks/event-day.md` step on competitions.

## Evidence

- Exploration on 2026-10-20: `sale-competitions.tsx:99-104` resets the draft when the `pass.saved` array reference changes, and every read or write answer brings a new array. Drafts live in `PassCompetitions` local state, so `SaleCash` and `SaleComplimentary` cannot see them. `selectionSummary` (`sale-cash-model.ts:162`) lists only selections; `saleCompetitionPasses` already reads the pass types' `access` links.
- Task 1 on 2026-10-20: RED Vitest 4 failures (`effectiveDraft`/`withDraft` missing) and the new Playwright test failed on the old component (Breaking unchecked after adding a pass); GREEN Vitest 557/557, `admin-registration-competitions.spec.ts` + `admin-event-sales.spec.ts` 12/12, lint and build pass. Drafts live in `RegistrationScreen` as `CompetitionDrafts` keyed by `registrationPassId`; `withDraft` drops an entry on save or when it matches the saved set. The rejected-selection test now expects the draft to survive "Recargar". Commit: 5dfc4fb; native review approved (lineage review-4d41cb90c59e46f3) with advisories: orphan drafts for passes no longer held, and reload keeping a rejected draft (task 2 handles both: unsaved passes are computed from held passes only, and "Descartar cambios" drops a draft).
- Task 2 on 2026-10-20: RED Vitest 4 failures (`unsavedCompetitionPasses`/`unsavedCompetitionsHint` missing); the 3 new Playwright tests failed with the page passing `unsavedCompetitions={null}`, and the focus assertion failed before `discard` moved focus. GREEN Vitest 561/561, the four sale specs 24/24, lint and typecheck pass. `unsavedCompetitionPasses` iterates held passes, so orphan drafts never block; cash reuses its reason paragraph (`waiting = unavailable ?? unsavedCompetitions`), complimentary adds one; both `confirm()` handlers close the dialog without posting if checks became unsaved. "Descartar cambios" shows only for a changed draft and moves focus to the pass's first checkbox. Commit: 43f7452; native review approved (lineage review-8fb74759c58584d2), one informational suggestion on cash reason precedence (no passes means no drafts, so no change).
- Task 3 on 2026-10-20: RED Vitest 4 failures (`passCompetitionLines` missing), then 1 failure for a pass type missing from the loaded list (it hid the line instead of falling back). GREEN Vitest 565/565, the five registration and sale specs 28/28, `public-payment-return.spec.ts` 8/8 (the only other spec with "Competencias:"), lint and typecheck pass. `passCompetitionLines` lists active `competition` activities with `included` access and shows the selection summary when the type is unknown, the pass has selections, or its type has a selectable link. Sale mode shows only the included line. Commit: 03e8ec1; native review approved (lineage review-a7e974e334c732af), one informational suggestion.
- Task 4 on 2026-10-20: docs only, no native review. `docs/frontend-architecture.md` (registration screen: competition lines; sale: drafts, "Descartar cambios", blocked confirmation) and `docs/runbooks/event-day.md` step 4.
