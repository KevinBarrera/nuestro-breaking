# Current-State Stabilization Plan

> **Status: historical/provisional context (DRAFT, snapshot as of 2026-08-11).** Branch, PR, check, and delivery claims below are point-in-time observations, not current status. Use [master issue #57](https://github.com/KevinBarrera/nuestro-breaking/issues/57) for current November MVP tracking and the [MVP proposal](november-2026-mvp-proposal.md) for proposed scope; that proposal remains **DRAFT pending organizer validation**. This plan does not authorize implementation.

## Document Control

| Field                   | Value                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                  | **DRAFT**                                                                                                                                                                                                                       |
| As of                   | 2026-08-11                                                                                                                                                                                                                      |
| Purpose                 | Reconcile the approved plan, current implementation, historical verification, and actual delivery state; then define a no-regret stabilization sequence that can be evaluated while product facts are collected asynchronously. |
| Repository              | `KevinBarrera/nuestro-breaking`                                                                                                                                                                                                 |
| Working branch observed | `feat/event-lifecycle-status`                                                                                                                                                                                                   |
| Product horizons        | Provisional November 2026 preliminary pilot; May 2027 main event horizon                                                                                                                                                        |
| Authority boundary      | This document is a plan. It does **not** authorize stabilization work, merge any PR, change product scope, approve the November pilot, or promise May 2027 capabilities.                                                        |

## Executive Diagnosis

The repository contains a credible local technical slice, not an operational pilot product. The slice persists organizations, venues, and events in PostgreSQL; exposes a scoped read endpoint and guarded local seed; renders the data at `/admin`; and adds a partial draft/published/closed lifecycle contract. Those changes are four commits above `origin/dev` and are represented by four open stacked PRs. None of the four PRs has a GitHub check result or review.

The strongest current asset is the PostgreSQL 16 migration harness already merged through `dev` and promoted to `main`. The open stack has detailed historical local test evidence, but that evidence is not equivalent to current reproducibility, automated PR checks, independent review, staging proof, or delivery. Mergeability reported by GitHub is only a conflict-state observation; it is not a quality or release gate.

The largest current risk is not an isolated defect. It is truth drift across planning and delivery artifacts:

- The approved OpenSpec proposal and design remain planning-only and describe a foundation gate plus four separately authorized vertical releases.
- The locally modified `tasks.md` has become a WU2 completion ledger and omits most of the approved plan from its active task structure.
- The untracked `apply-progress.md` records extensive local evidence but incorrectly says no branch, commit, push, or PR was created.
- Git and GitHub show four commits and four open PRs, all undelivered and without checks or reviews.
- The November brief is explicitly provisional and introduces candidate product directions that cannot yet override the approved plan.

The no-regret response is to stabilize evidence and delivery mechanics before adding product behavior. Product-rule discovery can proceed in parallel, but auth-protected operational workflows, participant check-in, competition filters, judge capture, reviewed results, and regulated data behavior must not be invented from incomplete organizer facts.

## Source-of-Truth Hierarchy

Different evidence answers different questions. No single artifact is authoritative for every dimension.

| Question                             | Evidence that wins                                                                                                 | Treatment of disagreement                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| What exists on disk now?             | Current files and CodeGraph/source inspection                                                                      | Current source overrides planning prose and historical progress claims.                                             |
| What is committed and in what order? | Git objects, refs, merge base, and ancestry                                                                        | Git overrides task checkboxes, PR prose, and memory.                                                                |
| What is delivered or under review?   | Current GitHub PR/issue state, bases, heads, checks, reviews, and mergeability                                     | GitHub overrides stale delivery prose. An open PR is not delivered.                                                 |
| What was approved as plan?           | Approved proposal, design, delta specs, ADRs, and accepted issue scope                                             | Planning artifacts define intended boundaries but do not prove implementation or authorize a new product direction. |
| What was historically verified?      | Exact command/result records tied to a commit or work unit                                                         | Historical results remain useful evidence but are not current PR checks and were not rerun for this reconciliation. |
| What is candidate product direction? | The DRAFT November brief and future organizer evidence                                                             | Candidate scope cannot override approved scope until the product decision gate is passed.                           |
| What is safe for real operations?    | Current executable controls plus demonstrated staging, backup/restore, observability, security, and owned runbooks | Planning-only controls and local demonstrations do not establish operational readiness.                             |

When facts conflict, record the conflict rather than merging the claims. In particular, a checked task cannot turn an open PR into delivered behavior, and a clean GitHub merge state cannot turn historical local tests into required checks.

## Repository And Delivery Snapshot

### Git State

| Item                                        | Verified state                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current branch                              | `feat/event-lifecycle-status`, tracking `origin/feat/event-lifecycle-status`                                                                                                                                              |
| Relation to `origin/dev`                    | 0 behind, 4 ahead; merge base `6ef92bbb5ccf9a20098bf20ae89638b7c901c34e`                                                                                                                                                  |
| Worktree before this document               | Modified `openspec/changes/breaking-event-system-foundation/tasks.md`; untracked `openspec/changes/breaking-event-system-foundation/apply-progress.md`; untracked `docs/product/november-2026-preliminary-pilot-brief.md` |
| Open-stack aggregate diff from `origin/dev` | 32 files, 1,738 insertions, 2 deletions                                                                                                                                                                                   |
| Local `main` and `staging`                  | Both point to the initial commit and are behind their remotes; delivery facts must use remote refs, not those stale local branch pointers.                                                                                |

Exact commit stack above `origin/dev`, oldest first:

1. `97cf4f21fca75b3402c0c18eeacc235be4ae0d91` (`97cf4f2`) - `feat(database): persist event organization foundation`
2. `fee46d10744fac05687aadd53bdbf8299a64d9df` (`fee46d1`) - `feat(events): expose scoped event organization reads`
3. `999d89673458347f73e98b3d06e871ce529ace75` (`999d896`) - `feat(admin): show event organization view`
4. `7ba1144576ad9d99cbb5843a8678c0f1c0492c92` (`7ba1144`) - `feat(events): add lifecycle and visible status`

### Merged Foundation

`origin/dev` contains the planning/documentation merge sequence and the PostgreSQL harness merge. The first-parent history includes planning alignment, architecture contracts, privacy/security planning, operational runbooks, and PR #27. PR #27 merged `test/postgres-migration-harness` into `dev` at `6ef92bb`; PR #29 promoted that foundation through `staging` to `main` at remote merge commit `25b9119`. Neither PR currently reports GitHub checks or reviews.

The merged PostgreSQL harness is executable implementation. The planning documents remain planning evidence. The overall non-user Foundation Gate is still incomplete because audit/outbox foundations, ownership, legal decisions, and production operations are not implemented.

### Issues And Pull Requests

| Artifact                  | Verified state                                                                                                            | Meaning                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Issue #5                  | Open; no labels; Mexico legal-review gate                                                                                 | Regulated and country-specific behavior remains blocked.                                        |
| Issue #26                 | Closed; `status:approved`                                                                                                 | PostgreSQL 16 harness scope was completed and merged. Audit/outbox was explicitly excluded.     |
| Issues #30, #31, #34, #35 | Open; each has `status:approved` and `enhancement`                                                                        | Approved issue scopes back the four open implementation PRs, but the issues are not closed.     |
| PR #32                    | Open, non-draft, base `dev`, head `feat/event-organization-persistence`, clean and mergeable                              | Stack position 1; 492 additions, 0 deletions, 8 files. No checks, reviews, or review decision.  |
| PR #33                    | Open, non-draft, base `feat/event-organization-persistence`, head `feat/event-organization-read-api`, clean and mergeable | Stack position 2; 382 additions, 1 deletion, 10 files. No checks, reviews, or review decision.  |
| PR #36                    | Open, non-draft, base `feat/event-organization-read-api`, head `feat/admin-event-organization-view`, clean and mergeable  | Stack position 3; 200 additions, 1 deletion, 8 files. No checks, reviews, or review decision.   |
| PR #37                    | Open, non-draft, base `feat/admin-event-organization-view`, head `feat/event-lifecycle-status`, clean and mergeable       | Stack position 4; 667 additions, 3 deletions, 16 files. No checks, reviews, or review decision. |

GitHub's `CLEAN` and `MERGEABLE` values are point-in-time conflict assessments. They do not satisfy the repository skill policy that automated checks pass before merge, and they do not provide human review.

## Reconciliation Matrix

Confidence describes confidence in the factual reconciliation, not confidence that the capability is production-ready.

| Capability                  | Planned                                                                                                                        | Implemented now                                                                                                                                                        | Historical verification                                                                                                   | Current delivery state                                                    | Product value                                                                    | Material gaps                                                                                                                                                                                    | Confidence |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Documentation foundation    | Planning country, bounded contexts, lifecycle, contracts, threat model, runbooks, and release sequence                         | Planning artifacts are merged on `dev`/remote promotion path                                                                                                           | Documentation reviews and merge history; no runtime claim                                                                 | Delivered as documentation; Foundation Gate still incomplete              | Shared architecture and safety language                                          | Some documents still describe future-only state where the PG harness and event slice now exist; no operational owners                                                                            | High       |
| PostgreSQL 16 harness       | Real migrations, reset, cleanup, isolation                                                                                     | Testcontainers `postgres:16` harness applies committed migrations and resets schemas                                                                                   | Historical focused E2E: 1 suite, 2 tests passed; PR #27 merged                                                            | Merged to `dev` and promoted via PR #29                                   | Reliable PostgreSQL-specific migration evidence                                  | No CI runner, parallelization, production restore proof, or current baseline run in this task                                                                                                    | High       |
| Event persistence           | Organization, venue, event, schedule, organizer and scoped venue references                                                    | `0001` plus Drizzle schemas; UUIDs, timezone schedule, nullable end, organizer FK, composite organization/venue FK                                                     | Historical persistence E2E: 2 tests passed against PG16                                                                   | Commit `97cf4f2`; open PR #32; no checks/reviews                          | Establishes event and venue source data                                          | No event activity model, branding, full event-scope isolation across future entities, staging proof, or delivery                                                                                 | High       |
| Read API and local seed     | Scoped read surface and explicit demonstration data                                                                            | `GET /organizations/:organizationId/events`; fixed-ID idempotent local seed guarded by `LOCAL_SEED=1`, non-production, loopback DB                                     | Historical unit 6 and PG16 E2E 4 passed; double-seed and scoped runtime request recorded                                  | Commit `fee46d1`; open PR #33 stacked on #32; no checks/reviews           | Makes persisted event information inspectable                                    | Endpoint is unauthenticated; frontend uses a hard-coded local organization ID; no production seed policy                                                                                         | High       |
| `/admin`                    | Accessible visible event shell                                                                                                 | React view renders organization, event, venue, schedule, lifecycle with loading/error states; Vite dev proxy                                                           | Historical focused Playwright 3 passed, later task command 6 including placeholders; one real local browser path recorded | Commit `999d896`; open PR #36 stacked on #33; no checks/reviews           | Demonstrates an end-to-end read path                                             | Not an authenticated admin workspace; development-only proxy; no deployed runtime config; no participant workflow                                                                                | High       |
| Event lifecycle             | Stable lifecycle, publication guard, operational rejection before publication/after closure                                    | `lifecycle` text column defaults to `draft`; service can create, require published state, and publish for a supplied matching organizer actor; read UI displays status | Historical unit 4, lifecycle E2E 2, read E2E 4, Playwright view evidence recorded                                         | Commit `7ba1144`; open PR #37 stacked on #36; no checks/reviews           | Establishes a minimal availability boundary                                      | Partial only: no HTTP mutation, no real authentication/authorization, no durable audit, no explicit close operation, no DB enum/check constraint, supplied actor is trusted application input    | High       |
| Authentication and sessions | Username/password, Argon2id, opaque PostgreSQL sessions, secure cookie, CSRF/origin protection, revocation, safe denial, audit | Frontend role/session types and an in-memory Zustand store exist; route boundary explicitly says authorization is not implemented                                      | No implementation verification                                                                                            | Not delivered; no corresponding open implementation PR in inspected stack | Required for any protected operator workflow                                     | No credential verification, session table, cookie, middleware/guard, CSRF, revocation, audit, HTTPS deployment, or Argon2 benchmark                                                              | High       |
| Accreditation and check-in  | Profiles, event participation/enrollment, crews, waiver status boundary, idempotent authorized check-in                        | None in current modules or migrations                                                                                                                                  | None                                                                                                                      | Planned only                                                              | Directly addresses paper rosters and chaotic entry                               | Product rules, legal boundaries, data model, authorization, audit, UI, import, lookup, correction and fallback are absent                                                                        | High       |
| Competition filters         | Event/category/stage/group/performance/evaluation and reviewed advancement under confirmed rules                               | None                                                                                                                                                                   | None                                                                                                                      | Planned spec exists, but November direction is only a hypothesis          | Could reduce group and top-N coordination burden                                 | Exact category/stage rules, group assignment, judge evidence, aggregation, exceptions and approval are unknown; existing spec assumes constructs not yet reconciled to observed showcase filters | High       |
| Audit and outbox            | Append-only redacted audit and ordered outbox committed with authoritative changes                                             | None                                                                                                                                                                   | Harness can support future persistence tests, but does not prove audit/outbox                                             | Foundation incomplete                                                     | Required for corrections, approvals, security decisions and reliable publication | No tables, transaction boundary, writers, redaction, ordering, retention, degradation behavior or review tooling                                                                                 | High       |
| Operations and deployment   | Connected operation, support/recovery ownership, observability, deployment and recovery procedures                             | Local PostgreSQL Compose service; local Nest/Vite scripts; planning-only runbooks                                                                                      | Historical local runtime demonstrations only                                                                              | No production/staging delivery configuration                              | Necessary to operate safely at a real event                                      | No workflows, Dockerfiles/app deployment, staging, health/readiness endpoints, backup/restore, logs/correlation, alerts, on-call/support ownership, SLOs or release procedure                    | High       |

## Artifact-Drift Ledger

| Artifact or claim                      | Observed drift                                                                                                                  | Current fact                                                                                                                                        | Later disposition; no edit now                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.md` title and task structure    | Locally rewritten as “Release 1 WU2”; most approved Foundation and Release 1 work appears only under Deferred Scope             | Approved proposal/design still define a non-user foundation gate and four separately authorized releases; WU2 is only part of the implemented slice | Restore a complete plan-oriented task ledger or replace it with an explicitly scoped delivery ledger linked to the full plan. Do not let completed WU2 checkboxes imply Release 1 completion. |
| `tasks.md` PR numbering                | Suggested WU2-A/B/C use “PR #2/#3/#4”                                                                                           | Actual PRs are #33/#36/#37; WU1 is #32                                                                                                              | Correct identifiers and preserve stack bases after delivery strategy is approved.                                                                                                             |
| `tasks.md` completion claims           | WU2 tasks are checked while “verification after apply” remains unchecked                                                        | Historical verification is extensively recorded, but current PR checks/reviews are absent and the stack is unmerged                                 | Separate implementation-complete, historically verified, currently checked, reviewed, and merged states.                                                                                      |
| `apply-progress.md` delivery statement | Says no branch, commit, push, or PR was created                                                                                 | Four commits are pushed and represented by open PRs #32/#33/#36/#37                                                                                 | Replace with exact commit/PR delivery state and retain historical commands as historical evidence.                                                                                            |
| `apply-progress.md` task-state text    | Calls artifacts “hybrid” and contains stale earlier claims such as absent production files within historical RED sections       | Current on-disk source includes the lifecycle service/repository and all four work units                                                            | Preserve dated TDD history only where useful; move current status to a concise commit-bound ledger.                                                                                           |
| Approved plan versus WU2 ledger        | Approved plan says planning-only and separately authorized releases; ledger treats WU1/WU2 implementation as Release 1 boundary | Current implementation is an event-organization demonstration slice, not Accreditation Release 1                                                    | Reconcile nomenclature after deciding whether the slice is a foundation/enabler or part of a revised first vertical.                                                                          |
| November brief versus approved plan    | Brief suggests a registration/check-in/filter pilot may provide more value than accreditation-only sequencing                   | The brief is DRAFT and its category/stage/rule inputs are unknown                                                                                   | Keep as candidate product input. Change sequencing/specs only after the scope gate passes.                                                                                                    |
| Issue completion versus PR bodies      | Issues #30/#31/#34/#35 remain open; PR bodies contain checked validation and `Closes` prose                                     | PRs are open and `closingIssuesReferences` is empty in the queried GitHub response                                                                  | Verify issue linkage behavior before merge and close issues only through the approved delivery path.                                                                                          |

## Pull-Request Disposition

### PR #32: Persistence Foundation

| Field                            | Disposition                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose                          | Add organization, venue and event schemas, `0001`, generated metadata, constraints and PG16 persistence proof.                                                                                         |
| Dependency                       | Directly based on `dev`; no open-stack parent.                                                                                                                                                         |
| User/business value              | Enables authoritative event, venue and schedule storage. It has little direct user value without the later read/UI slices.                                                                             |
| Verification evidence            | PR body records persistence E2E 2/2, harness E2E 2/2, build, targeted lint/format and diff checks. This is historical local evidence.                                                                  |
| Missing gate                     | No GitHub checks, no review, no bounded fresh baseline tied to the PR head, and no independent migration review.                                                                                       |
| Recommended stabilization action | Preserve the branch and diff. Establish required checks, execute the bounded baseline on exact head `97cf4f2`, review migration/generated metadata and rollback, then make an explicit merge decision. |
| Merge-order boundary             | Must be decided first. Do not merge a child first or merge merely because GitHub reports `CLEAN`.                                                                                                      |

### PR #33: Scoped Read API And Seed

| Field                            | Disposition                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose                          | Expose scoped organization/event reads and add a guarded, idempotent local seed.                                                                                               |
| Dependency                       | Base `feat/event-organization-persistence`; depends on PR #32.                                                                                                                 |
| User/business value              | Makes the persisted event schedule retrievable and supports a reproducible local demonstration.                                                                                |
| Verification evidence            | PR body records unit 6/6, PG16 E2E 4/4, build/lint/format, double seed and scoped runtime request. Historical local evidence only.                                             |
| Missing gate                     | No GitHub checks/review; no current proof after parent merge/retarget; endpoint has no auth and seed is development-only.                                                      |
| Recommended stabilization action | Run checks on its current isolated diff, review scope and seed safety, then after #32 is accepted retarget/rebase to `dev` and require the checks again on the resulting head. |
| Merge-order boundary             | Never merge before #32. Retargeting must preserve a WU2-A-only diff.                                                                                                           |

### PR #36: `/admin` Read View

| Field                            | Disposition                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose                          | Render the seeded organization, event, venue and schedule with accessible loading/error states through a development proxy.                                                                            |
| Dependency                       | Base `feat/event-organization-read-api`; depends on PR #33 and transitively #32.                                                                                                                       |
| User/business value              | First visible end-to-end demonstration of event and schedule data.                                                                                                                                     |
| Verification evidence            | PR body records focused Playwright 3/3, frontend build/lint/format/diff, and a local Docker PostgreSQL-to-browser demonstration. Historical local evidence only.                                       |
| Missing gate                     | No GitHub checks/review; no deployed API routing; browser tests primarily intercept responses; `/admin` is not protected.                                                                              |
| Recommended stabilization action | Require frontend static checks and focused Chromium tests on the isolated PR, plus a separately owned runtime smoke proof. Review the hard-coded local organization boundary before any non-local use. |
| Merge-order boundary             | Never merge before #33. Retarget/rebase and rerun gates after each parent lands.                                                                                                                       |

### PR #37: Lifecycle And Visible Status

| Field                            | Disposition                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose                          | Add `draft`/`published`/`closed` state, trusted-actor publication service behavior, operational guards, read projection and visible status.                                                                     |
| Dependency                       | Base `feat/admin-event-organization-view`; depends on PR #36 and all prior stack entries.                                                                                                                       |
| User/business value              | Makes event availability visible and introduces a minimal publication boundary.                                                                                                                                 |
| Verification evidence            | PR body records unit 4/4, lifecycle E2E 2/2, read E2E 4/4, Playwright 6/6, builds/lints/format/diff and a local runtime proof. Historical local evidence only.                                                  |
| Missing gate                     | No GitHub checks/review; 667-line total diff has an asserted size exception but still needs focused review; no authenticated caller, HTTP mutation, audit, close operation or database value constraint.        |
| Recommended stabilization action | Keep the current scope bounded. Review migration and authorization assumptions explicitly, run the required checks on the exact isolated head, and do not represent this as completed lifecycle administration. |
| Merge-order boundary             | Last in the chain. It may only be considered after #32, #33 and #36 are accepted in order and its base/diff/checks are refreshed.                                                                               |

## CI And Verification Readiness

### Current Inventory

| Area                  | Available evidence or command                                                                                                                                    | Current limitation                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root                  | `pnpm format:check`; `pnpm verify:setup`                                                                                                                         | `verify:setup` is a broad local acceptance runner, starts/reuses services, and intentionally does not migrate. It was not run here.                                   |
| Backend static        | `pnpm --filter @nuestro-breaking/backend lint`; `pnpm --filter @nuestro-breaking/backend build`                                                                  | No CI workflow invokes them.                                                                                                                                          |
| Backend unit          | `pnpm --filter @nuestro-breaking/backend test` or focused Jest paths                                                                                             | Historical focused evidence exists; no current run in this reconciliation.                                                                                            |
| Backend E2E           | `pnpm --filter @nuestro-breaking/backend test:e2e -- --runInBand <path>`                                                                                         | Requires Docker/Testcontainers and pulls/starts PostgreSQL 16 as needed. No CI runner is configured.                                                                  |
| Migrations            | `pnpm --filter @nuestro-breaking/backend db:migrate`; harness applies committed migrations                                                                       | The persistent local migration command changes DB state and must remain outside generic static verification. No production migration policy or rollback proof exists. |
| Frontend static       | `pnpm --filter @nuestro-breaking/frontend lint`; `pnpm --filter @nuestro-breaking/frontend build`                                                                | No CI workflow invokes them.                                                                                                                                          |
| Frontend browser      | `pnpm --filter @nuestro-breaking/frontend test:e2e`; focused `pnpm --filter @nuestro-breaking/frontend exec playwright test e2e/event-organization-view.spec.ts` | Requires Chromium. Playwright starts Vite at `127.0.0.1:4173`; mocked tests do not themselves start Nest/PostgreSQL.                                                  |
| Runtime demonstration | Manual Compose PostgreSQL, migration, guarded seed, Nest, Vite proxy and Chromium/curl sequence                                                                  | Historical only; requires local environment values, ports, services and cleanup ownership. It is not a PR check.                                                      |
| GitHub automation     | `.github/PULL_REQUEST_TEMPLATE.md` only                                                                                                                          | No `.github/workflows` files exist at the inspected HEAD. All four open PRs have empty check rollups.                                                                 |

Environment configuration is local-development oriented: the tracked example defines `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and optional `DATABASE_URL`; Compose publishes PostgreSQL 16 on host port 5432 with a named volume. There is no app container, Compose healthcheck, deployment manifest, secret-manager integration, or environment-specific config contract.

### Proposed Minimal Required-Check Matrix

This matrix is a recommendation for a later authorized CI work unit. It does not claim these checks exist.

| Check name                  | Trigger/scope                                                                | Required evidence                                                                                                                                   | Runtime needs                                                                |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `quality / format`          | Every PR                                                                     | `pnpm format:check`                                                                                                                                 | Pinned Node 24.18.1 and pnpm lockfile install                                |
| `backend / lint-build-unit` | Backend/shared/config changes                                                | Backend lint, build and unit tests                                                                                                                  | Node/pnpm; no persistent service                                             |
| `backend / postgres-e2e`    | Backend, migrations or lockfile changes                                      | Sequential PostgreSQL 16 E2E including harness and affected migration suites                                                                        | Docker-compatible runner and Testcontainers                                  |
| `frontend / lint-build`     | Frontend/shared/config changes                                               | Frontend lint and production build                                                                                                                  | Node/pnpm                                                                    |
| `frontend / playwright`     | Frontend changes                                                             | Chromium route/view tests with artifacts on failure                                                                                                 | Installed Playwright Chromium; Vite web server                               |
| `runtime / bounded-smoke`   | Integration-affecting stack heads or release candidate, not every trivial PR | Apply migrations to disposable/purpose-built DB, guarded fixture policy, start backend/frontend, prove selected API and browser path, then clean up | Isolated PostgreSQL, non-secret test config, bounded ports/process lifecycle |
| `delivery / PR-policy`      | Every PR                                                                     | Approved linked issue, exactly one type label, valid branch/title, chain context where applicable                                                   | GitHub metadata access                                                       |

PR checks must report on the exact PR head. Local commands remain supporting evidence and should record commit, command, result, date and environment; they must not be presented as GitHub checks.

### Separate Bounded Baseline Run

No tests, builds, services or migrations were run during this documentation task. Before any merge decision, authorize a separate baseline run against an immutable commit or temporary review ref:

1. Record Node, pnpm, Docker, PostgreSQL image, Chromium and commit identity.
2. Run non-writing format checks, backend lint/build/unit, frontend lint/build, and focused Playwright.
3. Run backend PG16 E2E sequentially with Testcontainers; capture migration list and exact suite/test counts.
4. Run one isolated runtime smoke path using non-production data: migrate, seed under the local gate, request the scoped API, render `/admin`, and clean up only owned processes/data.
5. Publish the command/result ledger as review evidence tied to the exact head; do not alter product scope or merge as part of the run.

## No-Regret Operational Readiness

### Can Be Prepared Now, Subject To Explicit Execution Authorization

| Area                                   | No-regret preparation                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staging contract                       | Define one non-production environment, owner, URL boundaries, data classification, access boundary, promotion path and teardown responsibility. Do not populate participant data.                                              |
| Environment/config                     | Inventory required variables; separate build-time, runtime and secret values; fail safely on missing values; remove assumptions that a Vite development proxy is deployment routing.                                           |
| Migration policy                       | Define forward application, preflight, ownership, backup prerequisite, failure stop, version recording and rollback/roll-forward decision process. Keep local seed prohibited outside explicit loopback development.           |
| Health/readiness                       | Specify separate liveness and dependency-aware readiness, including database reachability without exposing credentials or internals.                                                                                           |
| Logs/correlation                       | Define structured request/error logs, request correlation, redaction rules and minimum retention pending legal/security ownership. Do not log credentials, session IDs or participant-sensitive data.                          |
| Delivery hygiene                       | Add required PR checks, immutable build evidence, environment promotion records and a release checklist.                                                                                                                       |
| Support ownership                      | Assign named engineering and event-operation owners, escalation channels, support hours for rehearsal/event use and authority to stop the pilot.                                                                               |
| Device/connectivity rehearsal template | Prepare a checklist for phones/tablets/laptops, browsers, power, Wi-Fi/cellular paths, venue zones, printers and cutoff criteria. Actual acceptance needs organizer facts and venue testing.                                   |
| Export/print fallback design           | Define who owns snapshots, when records are generated, where they are stored, minimum fields, version/time labels and destruction/retention boundary. Actual participant exports require approved scope and privacy decisions. |

### Requires Organizer Or Policy Facts

| Area                           | Blocking facts                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Real pilot staging data        | Selected category/activity, authoritative roster source, allowed fields, access roles and privacy handling                             |
| Check-in operation             | Checkpoints, lookup keys, credentials, exception handling, duplicate/walk-in policy and activity-level versus event-level meaning      |
| Device/connectivity acceptance | Venue, expected devices, network availability, power, printer access, support owner and software cutoff condition                      |
| Competition operation          | Category, stage, groups, order, judge evidence, top-N method, ties/no-shows/disqualifications, correction and final approval authority |
| Export/print contents          | Required operating records, audience, minimization, timing, custody, retention and destruction                                         |
| Minor/waiver/regulated data    | Counsel and operations decision recorded through the Mexico gate; issue #5 remains open                                                |

### Production Gaps That Must Not Be Hand-Waved

- No staging or production deployment configuration exists.
- No application Dockerfile, hosted database configuration, TLS/cookie boundary, secret management, domain/routing or release automation exists.
- No backup, restore, failover, point-in-time recovery, recovery objective or restore drill exists.
- No health/readiness endpoint, structured logging/correlation standard, metrics, alerting or dashboard exists.
- No support/on-call roster, service level, incident process, operator training or production access review exists.
- Current runbooks explicitly describe planned future behavior and unavailable procedures.
- Connectivity is required by ADR 0005; therefore a real pilot needs measured connectivity and an organizer-owned manual event procedure. It must not invent offline synchronization or replay.

## Scale Baseline For 300+ Participants

The prior event reportedly involved more than 300 bboys. That is a test-design input, not proof of expected November volume and not a performance claim. The current implementation has no participant, check-in, group, judging or result-review flows, so it cannot yet be performance-tested for those behaviors.

### Bounded Objectives

| Flow                     | Objective when implemented                                                                                                                                  | Evidence to capture                                                                                                            | Current status                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Registration/roster load | Load a deterministic synthetic roster of at least 300 participant entries, including controlled duplicates and mismatches, without production personal data | Import duration, accepted/rejected counts, duplicate handling, DB query plan for critical paths, reproducible fixture identity | Unimplemented                             |
| Participant lookup       | Find the intended entry by confirmed lookup keys under realistic concurrency and typo/duplicate cases                                                       | Median, p95 and maximum latency; wrong-match/ambiguous-match count; query plan; resource use                                   | Unimplemented                             |
| Check-in                 | Record idempotent check-in and return current state for retries and ineligible entries                                                                      | Throughput at agreed station count, p50/p95/p99 latency, duplicate prevention, conflict/error rates, durable audit evidence    | Unimplemented                             |
| Group assignment         | Assign eligible checked-in entries to confirmed groups/heats and safely handle late changes                                                                 | Assignment duration, invariant violations, concurrency conflicts, correction trace and deterministic rerun evidence            | Unimplemented and rules unknown           |
| Judge capture            | Present the correct group/order and durably accept stage-specific evidence from the agreed number of judge devices                                          | Submit latency, failure/retry behavior, attribution, duplicate behavior, connectivity interruption response                    | Unimplemented and evidence format unknown |
| Result review            | Assemble source evidence for organizer review without inventing an aggregation rule                                                                         | Time from final captured evidence to review-ready view, completeness, discrepancy count, correction trace, approval boundary   | Unimplemented and decision rule unknown   |

### Baseline Method

1. Obtain approved volume, station/device concurrency, category/stage and timing assumptions; record them as test inputs, not universal facts.
2. Use synthetic, deterministic, non-sensitive data at 300, a modest headroom case such as 500, and targeted exception datasets. Headroom is for observation, not a capacity promise.
3. Test one flow at a time, then one bounded end-to-end rehearsal. Keep database, application revision, hardware, network shape and seed fixed and recorded.
4. Measure correctness first: no cross-event data, duplicate state, lost writes, unexplained qualifier decision or unaudited material correction.
5. Capture latency distributions, throughput, error/conflict rates, resource saturation, query plans and recovery behavior. Do not publish “supports 300+” without agreed thresholds and repeatable evidence.
6. Repeat after schema/index/query changes and before a pilot release candidate. A local laptop result is not staging or venue evidence.

## Stabilization Sequence

Every unit below requires explicit authorization before execution. “Can proceed now” means it does not depend on unresolved competition/product rules; it does not mean this document authorizes the work.

| Work unit                           | Outcome                                                                                                                         | Likely paths/areas                                                                                 | Verification gate                                                                                                       | Rollback boundary                                                                        | Product-scope change?                               | Can proceed while awaiting organizer facts?                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| S0: Freeze factual baseline         | Immutable record of refs, stack, diffs and artifact hashes before reconciliation work                                           | Git/GitHub evidence; no source behavior                                                            | Peer confirms commit/PR/issue snapshot and protected local files                                                        | Remove only generated evidence artifact if rejected                                      | No                                                  | Yes, after authorization                                                                                              |
| S1: Reconcile delivery ledgers      | `tasks.md` and `apply-progress.md` distinguish planned, implemented, historically verified, checked, reviewed and merged states | OpenSpec task/progress artifacts only                                                              | Factual diff review against Git/GitHub; no scope edits                                                                  | Revert only ledger corrections                                                           | No                                                  | Yes, after authorization                                                                                              |
| S2: Establish PR required checks    | Minimal CI reports static, unit, PG16, frontend and policy checks on exact heads                                                | `.github/workflows`, scripts only if needed, branch protection outside repo if separately approved | Checks execute in a clean clone; no skipped required jobs; artifacts identify head SHA                                  | Remove workflow/config unit without product code changes                                 | No                                                  | Yes, after authorization                                                                                              |
| S3: Run bounded current baseline    | Fresh evidence for exact stack head without changing product behavior                                                           | CI/review environment and evidence record                                                          | Matrix in “Separate Bounded Baseline Run” passes or produces owned defects                                              | Discard test environment and evidence run; no production/data mutation                   | No                                                  | Yes, after S2 or an approved temporary runner                                                                         |
| S4: Review and land stack in order  | Each PR has isolated diff, required checks, review and explicit merge decision                                                  | PR #32, then #33, #36, #37; branch bases                                                           | Required checks and review on each final head; parent retarget/rebase does not pollute child diff                       | Revert the specific merged work unit; migration rollback requires explicit data decision | No                                                  | Yes, but only after S2/S3 and maintainer merge authorization                                                          |
| S5: Staging/config foundation       | One documented non-production deployment boundary with secret/config ownership and no participant data                          | Deployment/config areas to be selected; environment docs                                           | Clean deployment, config validation, no committed secrets, bounded smoke, teardown proof                                | Destroy staging resources/config unit without touching production                        | No                                                  | Yes for design; provisioning needs owner/budget authorization                                                         |
| S6: Operability minimum             | Liveness/readiness, structured correlation/redaction, release evidence and support ownership exist                              | Backend platform boundary, logging/config, operational docs                                        | Failure-mode tests, redaction review, readiness behavior, owned alert/escalation rehearsal                              | Remove probes/logging adapters independently; preserve application behavior              | No                                                  | Yes, after deployment approach is selected                                                                            |
| S7: Backup and restore proof        | Versioned backup policy and successful isolated restore of the selected database service                                        | Infrastructure/runbook/test environment                                                            | Restore drill verifies migrations, row counts/invariants and documented RPO/RTO observations                            | Delete drill resources; never test by overwriting the active environment                 | No                                                  | Design now; execution after database host is selected                                                                 |
| S8: Authentication/session vertical | A protected operator can sign in, hold/revoke an opaque session and receive safe denial with audit                              | Identity module, session schema/migration, backend guards, frontend session flow, security tests   | Unit/PG16/browser/security checks, HTTPS cookie boundary in staging, revocation and audit proof                         | Revert one identity vertical and migration under an explicit data plan                   | Potentially: role names/scopes require confirmation | Session foundation can be specified; role-dependent implementation remains blocked until authority facts are accepted |
| S9: Pilot capability slice          | One selected registration/check-in or competition-stage flow is implemented end to end                                          | Product modules selected only after reconciliation                                                 | Approved scenarios, correctness/audit, scale baseline, device/connectivity rehearsal, fallback and organizer acceptance | One vertical slice with migration/data/export rollback plan                              | **Yes**                                             | No; blocked by November scope gate                                                                                    |

Work units should remain reviewable in roughly one reviewer-hour and normally below 400 changed lines. Generated migration metadata may require an explicit exception, but tests and rollback evidence must remain coupled to the behavior they verify.

## Safe Work, Blocked Work, And Stop Conditions

### Safe To Prepare While Awaiting The Brother

Subject to a separate execution authorization, the safe sequence is factual ledger correction, required-check setup, a bounded baseline run, orderly review of the existing PR stack, staging/config design, health/readiness/logging boundaries, backup/restore planning, support ownership assignment, and rehearsal templates. These activities improve truth, reproducibility and operational hygiene without deciding category rules, scoring, qualification, check-in meaning or regulated behavior.

The existing four-PR stack may be reviewed and tested while product discovery continues because its approved issue scopes intentionally exclude auth, accreditation, check-in, competition and regulated domains. It must not be relabeled as a completed Accreditation release or pilot-ready product.

### Blocked Pending Facts Or Decisions

- Any approval or implementation of the November candidate flow.
- Participant registration fields, import authority, identity matching, golden-ticket behavior, check-in meaning and exceptions.
- Category/stage/group models tied to November, judge evidence capture, aggregation, top-N, tie/no-show/disqualification or publication rules.
- Participant exports/prints containing real personal data, retention/deletion, minors, waivers, medical/incident or other regulated handling.
- Production use, event-day activation or a claim that May 2027 modules will be ready.

### Explicit STOP Conditions

Stop the affected stabilization or delivery action when any of the following is true:

- The exact head, base, diff or commit ancestry differs from the reviewed evidence.
- A required check is absent, skipped, stale, or failing; local success is offered as a substitute.
- A PR lacks approved issue linkage, focused review, or an explicit size exception where required.
- Retargeting/rebasing pollutes a child PR with parent or unrelated changes.
- Migration forward/rollback impact, backup prerequisite or data ownership is unclear.
- A workflow would expose real participant data before access, privacy, retention and support ownership are approved.
- The implementation requires an organizer rule that remains unknown or differs by category/stage.
- The product would calculate, rank, advance, publish or correct competition outcomes without confirmed rules and named approval authority.
- Connectivity, device, printer, support or manual fallback ownership is absent for a proposed real-use rehearsal.
- A legal, minor-data, waiver, payment, tax, prize, incident/medical or country-specific decision is required while issue #5 or its relevant evidence remains unresolved.
- The change expands product scope under the label of stabilization.

## Reconciliation Patch Preview

This section previews later changes only. No listed artifact is changed by this document.

### Factual Corrections Safe After Authorization

| Artifact                                                              | Later correction                                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/breaking-event-system-foundation/tasks.md`          | Restore the relationship to the full approved plan; replace placeholder PR numbers with #32/#33/#36/#37; separate completion from checks/review/merge; preserve deferred domains. |
| `openspec/changes/breaking-event-system-foundation/apply-progress.md` | Correct the false no-branch/no-commit/no-push/no-PR statement; bind evidence to exact commits and mark every test/runtime claim historical until rerun.                           |
| PR #32/#33/#36/#37 descriptions                                       | After check infrastructure exists, record actual required-check results and final parent/child boundaries; do not rewrite historical local evidence as CI.                        |
| Issues #30/#31/#34/#35                                                | Verify closing linkage and update status only through the accepted PR delivery path.                                                                                              |
| Planning/runbook status notes                                         | Where useful, acknowledge that the PG16 harness is now implemented while preserving the distinction between test harness and production recovery.                                 |

### Scope-Dependent Changes That Must Wait

| Artifact                                                                    | Why blocked                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal.md` and `design.md`                                               | Release sequence or first vertical may change only after the November product gate and feasibility review.                                  |
| Event, identity, accreditation, competition, operations and reporting specs | Selected category/stage/check-in/authority/fallback facts may alter requirements; universal scoring or workflow rules must not be invented. |
| `docs/product/november-2026-preliminary-pilot-brief.md`                     | It remains DRAFT until interview evidence and product-owner/organizer decisions are recorded.                                               |
| ADRs for identity, credentials, realtime and connectivity                   | Revisit only if approved pilot facts expose a real conflict; current planning choices remain boundaries, not implementation evidence.       |
| Mexico legal checklist and issue #5                                         | Require qualified owner decisions and evidence; engineering cannot mark them complete by inference.                                         |
| New pilot issues/tasks/PR chain                                             | Create only after approved scope is decomposed into reviewable vertical work units with verification and rollback boundaries.               |

## Decision Log

| Decision                                                                                             | Status                      | Basis                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| Treat the current product as an implemented local slice, not Release 1 completion or pilot readiness | Recorded in this plan       | Source, Git and GitHub reconciliation                   |
| Treat PR-body and progress-file test results as historical local evidence                            | Recorded in this plan       | No commands were rerun; all PR check rollups are empty  |
| Preserve the four-PR dependency order                                                                | Recommended, not authorized | Verified bases and one-commit-per-PR stack              |
| Stabilize delivery evidence before adding product behavior                                           | Recommended, not authorized | Reduces risk without deciding provisional product rules |
| Keep November scope provisional                                                                      | Required boundary           | DRAFT pilot brief and unresolved scope gate             |
| Do not promise all modules for May 2027                                                              | Required boundary           | May is a horizon, not a committed module list           |
| Require connectivity and organizer-owned manual event continuity; do not invent offline replay       | Existing planning boundary  | ADR 0005 and pilot brief                                |
| Do not design a universal competition rules engine                                                   | Required boundary           | Distinct category/stage rules remain unknown            |

## Open Risks

| Risk                                                           | Current exposure                                                                         | Near-term control                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Undelivered stack ages without checks/review                   | Four open PRs can drift from bases and dependencies                                      | Establish checks, run bounded baseline, review and decide in order         |
| Historical evidence cannot be reproduced                       | Commands depend on Docker, Chromium, local services and undocumented environment details | Clean-run ledger tied to exact SHA and environment                         |
| Lifecycle appears more complete than it is                     | Visible status and service method can be mistaken for authenticated administration       | Keep “partial lifecycle” label and review trusted-actor boundary           |
| Hard-coded local organization leaks into non-local assumptions | Frontend targets a fixed seed ID                                                         | Keep strictly local until tenant/event selection and auth are designed     |
| No audit for material decisions                                | Publication and future corrections lack durable actor/reason evidence                    | Do not activate sensitive workflows; plan audit vertical before them       |
| No restore or observability                                    | Failure may be undetected or unrecoverable                                               | Select staging/database host, then prove health, logs and isolated restore |
| Product rules arrive late                                      | November schedule may compress safe implementation and rehearsal                         | Select the narrowest valuable flow and enforce scope/feasibility gate      |
| Real participant data creates unowned exposure                 | Identity/check-in/export candidates imply personal data                                  | Keep synthetic data only until access/privacy/retention/support decisions  |
| Connectivity-only model may not fit venues                     | Network conditions are unknown                                                           | Venue/device rehearsal and explicit software cutoff/manual procedure       |
| Legal and minor-data requirements remain unresolved            | Mexico checklist is entirely pending and issue #5 is open                                | Keep affected behavior blocked and record qualified decisions              |

## Next Gate

Execution of stabilization begins only when a maintainer/product owner accepts this factual baseline, identifies the exact starting ref, assigns owners, and explicitly authorizes a bounded work unit. The first authorization should cover only delivery hygiene: ledger reconciliation, required checks and the separate baseline run. A merge decision requires fresh checks and review on each final PR head; this document alone does not authorize merge.

Product-scope reconciliation begins only when the brother interview and organizer follow-up provide the selected November category/activity, stage sequence, expected volume, roster authority, check-in rules, group/judge/decision rules, roles, devices, connectivity, print/export needs, fallback owner and success measures. The product owner and organizers must then approve the narrowest valuable flow and exclusions, followed by a feasibility review against the stabilized codebase and calendar.

Passing the stabilization gate authorizes only the named stabilization work units. Passing the product gate authorizes planning reconciliation, not automatic implementation. Implementation requires separately approved, reviewable work units with explicit verification, rollback, data and operational boundaries.

## Evidence Register

This plan was prepared from current source via CodeGraph first, direct reads for documentation/configuration, read-only Git commands, and read-only `gh` queries. Inspected evidence included:

- OpenSpec proposal, design, tasks, apply progress and relevant capability specs.
- The DRAFT November 2026 pilot brief.
- ADRs for Mexico, sessions, credentials, realtime, connectivity and PG16 testing.
- Privacy/security, data lifecycle, legal checklist and event-day/support/recovery runbooks.
- Workspace/backend/frontend scripts, Playwright/Vite configuration, PostgreSQL Compose, tracked environment example and migration SQL.
- Current implemented event-organization modules, database/bootstrap code, seed policy, frontend route/view and test harnesses.
- Git status, refs, first-parent history, merge base, ahead/behind count, exact commit stack and aggregate diff.
- GitHub issues #5, #26, #30, #31, #34 and #35; PRs #27, #29, #32, #33, #36 and #37, including bases, heads, status, checks, reviews and mergeability.

No test suite, build, formatter, migration, service or source-mutating command was run to produce this plan.
