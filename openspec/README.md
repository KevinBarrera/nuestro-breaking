# OpenSpec change guide

Navigate these artifacts by purpose; a change directory is not proof of delivered behavior. The November 2026 MVP proposal is **DRAFT pending organizer validation**, not an approved replacement for existing plans or specs.

## Active MVP tracking

- [November 2026 MVP master issue #57](https://github.com/KevinBarrera/nuestro-breaking/issues/57) — current MVP tracking and decisions, separate from OpenSpec change proposals.
- [Documentation cleanup issue #66](https://github.com/KevinBarrera/nuestro-breaking/issues/66) — navigation and status clarification only.

## Proposal in validation

- [November 2026 MVP proposal](../docs/product/november-2026-mvp-proposal.md) ([browser version](../docs/product/november-2026-mvp-proposal.html)) — product proposal outside OpenSpec; no implementation authorization follows from this link.

## Reusable references

- [Event activity foundation](changes/event-activity-foundation/proposal.md) — scoped persistence change for event containers and neutral activities, not a November pilot or payment/check-in implementation. Its [design](changes/event-activity-foundation/design.md), [delta spec](changes/event-activity-foundation/specs/event-activity-persistence/spec.md), and [apply progress](changes/event-activity-foundation/apply-progress.md) provide details and recorded progress; check current code and delivery evidence separately.
- [Technical documentation](../docs/README.md#reusable-references) — architecture and development references.

## Historical and provisional context

- [Breaking event system foundation](changes/breaking-event-system-foundation/proposal.md) — earlier planning-only release sequence with its own [design](changes/breaking-event-system-foundation/design.md), [delta specs](changes/breaking-event-system-foundation/specs/), and [apply progress](changes/breaking-event-system-foundation/apply-progress.md). Keep this change as historical planning evidence; do not infer it was superseded by the draft proposal.
- [Preliminary pilot brief and dated stabilization plan](../docs/README.md#historical-and-provisional-context) — provisional product and delivery context.

`specs/` currently has no baseline capabilities; the change-specific specs live under their respective `changes/` directories.
