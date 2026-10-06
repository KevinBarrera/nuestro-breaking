# November MVP organizer-decision alignment

## Tracking

- GitHub issues: #57, #65, #104; related #58, #105 and #112.
- Branch: `docs/mvp-organizer-policy-alignment` from clean `dev` at `b2edeac`.
- Engram mirror: `odd/november-mvp-organizer-alignment/tasks`.

## Goal

Align the November MVP draft, admin registration contracts, event-day runbook, and issue/project tracking with the organizer decisions recorded in #65 and #104. This records policy only; it does not deliver printable lists or correction commands.

## Scope and constraints

- Browser print/save-as-PDF; no CSV/Excel MVP list, no contact information on operational printouts. Day-of administrator owns paper fallback and later manual duplicate check, without automatic synchronization or unsafe manual replay of platform writes.
- Admin-only bounded correction/history: name/AKA with cross-event confirmation; equal-price discipline changes; justified pending void; cash correction with staff verification and evidence; paid cases escalated to principal organizer outside automated MVP; no provider-payment editing or refunds. Two years is a desired history period pending feasibility/legal review.
- Preserve proposal draft status, existing delivery boundaries and the safety stop for affected platform writes. Keep the Markdown and hand-authored HTML aligned.
- No changes to application behavior, tests, payment integrations, or issue delivery status. Do not silently invent retention mechanics, correction transitions, or check-in replay behavior.
- Remote label/project-field transitions need exact status/field authorization before mutation; keep existing Todo delivery status.

## Tasks

- [x] T1 Align draft proposal Markdown/HTML, audit and operations contracts, and event-day runbook with the confirmed bounded policy. Check `git diff --check`, formatting and cross-document terms; record results.
- [x] T2 Reconcile #65/#104 label and project metadata under the user's exact authorization for the intended transitions; read back statuses and preserve delivery Todo.

## Acceptance

- Reader can distinguish a manually printed paper contingency from offline software or replay.
- Reader can identify admin-only authorized corrections and deferred/forbidden mutations without consulting stale drafts.
- Documentation agrees with #65/#104, and any remaining label/project mismatches are explicitly reported rather than silently changed.

## Progress and evidence

- T1: completed in `841fb7d` (`docs(mvp): align organizer decisions across operating guidance`). Independent verifier found and writer fixed list groupings, optional receipt, cash correction audit, and settled field/authority mismatches. `git diff --check`, `git diff --cached --check`, and `corepack pnpm format:check` passed; no behavior tests apply to passive documentation.
- T2: confirmed by issue/project pre- and post-readback. #65 `status:ready`, Project Target `Build now`, Dependency `None`; #104 `status:blocked`, Target `Needs validation`, Dependency `Technical`; #105 `status:blocked`, Target `Needs validation`, Dependency `Technical`. All remain Open/Todo. No unrelated labels or status fields changed.
- No application tests or builds were run; this is a documentation/tracker alignment, not #65/#104 feature delivery. No push or PR was requested.

## Next step

Publish the local branch or open a documentation PR only if separately authorized; design #104 cash-correction transitions and retention mechanics before implementation, and implement #65 printable continuity separately.
