# Tasks: Breaking Event System Foundation

## Ledger Semantics

This ledger preserves the approved Foundation Gate and four-release plan while separately recording the narrow implementation slices that now exist. A checked box in the approved-plan phases means the whole planned task is complete; an implemented slice does not complete its broader parent task by inference.

| State                         | Meaning                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Planned                       | Approved scope that remains to be delivered.                                                         |
| Implemented                   | Code or documentation exists at the identified commit.                                               |
| Historically locally verified | A command/result was recorded when the identified commit was produced; it is not a current PR check. |
| Currently checked / reviewed  | GitHub reports a current check or review on the exact open PR head.                                  |
| Merged / delivered            | The commit has landed through the delivery path.                                                     |

## S0/S1 Factual Stabilization — 2026-08-11

- [x] S0 Freeze the factual Git/GitHub baseline in the ledgers: branch `feat/event-lifecycle-status`; four commits above `origin/dev`; open stack #32 → #33 → #36 → #37; issue and gate states below. This is a passive ledger snapshot, not a GitHub or product change.
- [x] S1 Reconcile this task ledger and `apply-progress.md`: retain the full approved plan; correct PR placeholders; distinguish implementation and historical evidence from current checks, review, merge, and delivery.

## S2 Required PR Checks — Locally Implemented (2026-08-12)

- [x] S2 Create `.github/workflows/pr-checks.yml`: implementation is locally YAML-validated and the configured backend/unit, PostgreSQL 16 E2E, frontend static, stack-compatible frontend E2E suite, and root `pnpm format:check` commands pass. Pull-request `edited` activity is included so chained PR base retargeting reruns checks; Playwright invokes the existing `test:e2e` script without assuming child-only files. The S2 format remediation used canonical Prettier only on the four reported Markdown files and did not change their semantics. No persistent PostgreSQL service, secret, product change, branch-protection mutation, or GitHub API policy automation was added.
- [ ] S2 GitHub execution remains pending: the workflow is implemented locally only and cannot report checks on the existing PR heads until an authorized push. Branch protection and `delivery / PR-policy` remain explicitly deferred.

### Verified Delivery Snapshot

| Item              | Current fact                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / relation | `feat/event-lifecycle-status`; 0 behind and 4 ahead of `origin/dev`; merge base `6ef92bbb5ccf9a20098bf20ae89638b7c901c34e`.                                                           |
| Commit 1 / PR #32 | `97cf4f21fca75b3402c0c18eeacc235be4ae0d91` — persistence foundation; open against `dev`.                                                                                              |
| Commit 2 / PR #33 | `fee46d10744fac05687aadd53bdbf8299a64d9df` — scoped event reads; open against PR #32's branch.                                                                                        |
| Commit 3 / PR #36 | `999d89673458347f73e98b3d06e871ce529ace75` — `/admin` view; open against PR #33's branch.                                                                                             |
| Commit 4 / PR #37 | `7ba1144576ad9d99cbb5843a8678c0f1c0492c92` — lifecycle/status; open against PR #36's branch.                                                                                          |
| Current PR gates  | Every PR is non-draft, `CLEAN`, and `MERGEABLE`, with an empty check rollup, no reviews, and no review decision. `CLEAN`/`MERGEABLE` are conflict observations, not acceptance gates. |
| Issues            | #5 is open (Mexico legal-review gate); #26 is closed with `status:approved`; #30, #31, #34, and #35 are open with `enhancement` and `status:approved`.                                |

## Review Workload Forecast

| Field                      | Value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Approved delivery strategy | `auto-chain`                                                                |
| Chain strategy             | `stacked-to-main`                                                           |
| 400-line budget risk       | High                                                                        |
| Observed GitHub PR totals  | #32: 492 additions / 0 deletions; #33: 382 / 1; #36: 200 / 1; #37: 667 / 3. |

Decision needed before apply: No — `auto-chain` and `stacked-to-main` were provided for this passive S0/S1 work unit.
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

The observed PR totals are factual review inputs. They do not establish that a size exception, current check, review, or merge approval exists. Historical authored-line accounting in `apply-progress.md` is retained as historical evidence and is not a substitute for the current GitHub diff or gates.

## Implemented Slice Ledger (Not Aggregate Plan Completion)

| Slice                   | Commit / PR / issue   | Implemented state                                                  | Historical local evidence                                                                               | Current checked / reviewed / merged state       |
| ----------------------- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| WU1 persistence         | `97cf4f2` / #32 / #30 | Organization, venue, event persistence and migration slice exists. | Commit-bound PG16 persistence and harness results are retained in `apply-progress.md`.                  | No GitHub checks or reviews; open and unmerged. |
| WU2-A read/API/seed     | `fee46d1` / #33 / #31 | Scoped read API and guarded local seed slice exists.               | Commit-bound unit and PG16 E2E results are retained in `apply-progress.md`.                             | No GitHub checks or reviews; open and unmerged. |
| WU2-B visible read view | `999d896` / #36 / #34 | FSD `/admin` read-view slice exists.                               | Commit-bound Playwright and local browser results are retained in `apply-progress.md`.                  | No GitHub checks or reviews; open and unmerged. |
| WU2-C lifecycle/status  | `7ba1144` / #37 / #35 | Lifecycle/status slice exists.                                     | Commit-bound unit, PG16 E2E, Playwright, and local runtime results are retained in `apply-progress.md`. | No GitHub checks or reviews; open and unmerged. |

- [x] WU1 and WU2 implementation slices are recorded accurately as implemented and historically locally verified evidence.
- [ ] No WU1/WU2 slice is currently checked, reviewed, merged, delivered, or equivalent to Release 1 Accreditation completion.

## Approved Plan — Completion Remains Pending

### Phase 1: Foundation Gate (not a user release)

- [ ] 1.1 Track Mexico evidence/status in `docs/adr/0001-operating-country.md` and `docs/legal/mexico-readiness-checklist.md`; no legal/compliance claim (issue #5).
- [ ] 1.2 Complete `docs/{security/privacy-threat-model.md,runbooks/{recovery,event-day,support}.md,models/{bounded-contexts,data-lifecycle}.md,contracts/api-event-versioning.md}` (issues #6–#8).
- [ ] 1.3 Reconcile task 1.6 in `openspec/changes/breaking-event-system-foundation/specs/`: Mexico is planning country; regulated behavior awaits legal/policy review.
- [ ] 1.4 Before design/schema/UI, clarify nickname, duo model/rules, tracks, battle-guest-placement, paid-workshop QR access, translators, travel/hotel, run-of-show, sponsor-deliverables, and pricing phases/bundles/golden-tickets/budget; no delivery claim.
- [ ] 1.5 RED `apps/backend/test/{postgres-harness,audit-outbox}.e2e-spec.ts`: PG16 migrations/reset/cleanup/isolation + scoped audit/outbox durability, redaction, ordering, degradation.
- [ ] 1.6 GREEN `apps/backend/test/support/postgres-harness.ts`, `apps/backend/src/database/{schema,audit,outbox}.ts`, `apps/backend/drizzle/`: tested scope/audit/outbox primitives.

### Phase 2: Release 1 — Accreditation

- [ ] 2.1 RED backend `apps/backend/src/modules/{event-organization,identity-access,participant-accreditation}/**/*.spec.ts`: event/venue, secure sign-in, profile/enrollment/crew, manual/QR staff station; minor/guardian waivers await legal policy.
- [ ] 2.2 RED frontend `apps/frontend/e2e/accreditation.spec.ts`: FSD context, sign-in, enrollment, crew, accessible station, safe status/errors.
- [ ] 2.3 GREEN backend modules under `apps/backend/src/modules/{event-organization,identity-access,participant-accreditation}/`: scoped API, persistence, audit.
- [ ] 2.4 GREEN FSD paths `apps/frontend/src/{entities,features,widgets,pages,app,shared}/`: usable accreditation UX.

### Phase 3: Release 2 — Competition Live

- [ ] 3.1 RED backend `apps/backend/src/modules/competition/**/*.spec.ts` and frontend `apps/frontend/e2e/competition-live.spec.ts`: qualifier/bracket controls, judge rubric scoring, stale/duplicate/recovery states, public results/projection UX.
- [ ] 3.2 GREEN `apps/backend/src/modules/competition/{api,application,domain,infrastructure}/` and `competition.gateway.ts`: server-authoritative, single-instance Socket.IO; no offline/manual replay.
- [ ] 3.3 GREEN competition FSD routes/widgets: accessible live status and snapshot recovery.

### Phase 4: Release 3 — Workshops and Basic Operations

- [ ] 4.1 RED backend/frontend tests: schedules, capacity, enrollment, attendance, feedback, staff roster/assignments/incidents, least-privilege status/error UX.
- [ ] 4.2 GREEN `apps/backend/src/modules/{workshops,operations}/` and matching FSD paths; translators, hospitality, travel/hotel, run-of-show, sponsor deliverables, and sensitive medical records remain unresolved requirements.

### Phase 5: Release 4 — Commerce

- [ ] 5.1 RED backend/frontend tests: catalog, inventory, non-regulated orders/reconciliation, accessible status/error UX.
- [ ] 5.2 GREEN `apps/backend/src/modules/commerce-finance/` and matching FSD paths; pricing phases, bundles, golden tickets, organizer budget, prizes, travel payments, payouts, tax/invoices, and payment policy require clarification/legal gates first.

### Phase 6: Verification

- [ ] 6.1 Run `pnpm verify:setup`, commands, lint/build/format, migration/reset/recovery drills, release scenarios; record no legal/offline/unresolved-domain claims.

## Current Delivery Gates

- [ ] Establish and run required checks on the exact final head of each PR.
- [ ] Obtain a focused review and explicit merge decision for each PR in #32 → #33 → #36 → #37 order.
- [ ] Merge/deliver no PR by inference from local history, checkbox state, or `CLEAN`/`MERGEABLE` status.

The November 2026 preliminary pilot brief remains DRAFT candidate direction only. It does not alter this plan, authorize product scope, or complete any task. The design threat matrix remains `N/A`; S0/S1 changed only passive Markdown ledgers, so no threat RED task applies.
