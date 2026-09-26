# November MVP documentation cleanup

## Tracking

- GitHub issue: #66 — docs: classify and reduce November MVP documentation noise
- Branch: docs/66-november-mvp-doc-cleanup

## Goal

Reduce documentation noise around the November 2026 MVP while preserving traceability, historical context, and reusable technical references.

## Tasks

- [x] Create traceable GitHub issue and work branch.
- [x] Classify documentation entry points by current, validation, reusable reference, and historical context.
- [x] Add clear historical/provisional notices where older docs can be mistaken for the current MVP plan.
- [x] Verify navigation consistency and changed files.

## Constraints

- Do not delete historical documentation in this pass.
- Do not change product requirements or implementation behavior.
- Keep the PR docs-only and focused.

## Evidence

- `git diff --check` passed.
- Changed docs-only files: `docs/README.md`, `openspec/README.md`, `docs/product/november-2026-preliminary-pilot-brief.md`, `docs/product/current-state-stabilization-plan.md`, `openspec/changes/breaking-event-system-foundation/proposal.md`, `openspec/changes/event-activity-foundation/proposal.md`.
- Issue #57 now links cleanup issue #66 under planning and validation.
- Cleanup commit: `4f69add`; PR #67.
