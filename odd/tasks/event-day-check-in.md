# Event-day check-in — issue #112

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/112 — open with `status:approved`; this slice references, but does not close, it.
- Backend prerequisite: PR #118 merged into `dev` at `046c0c6`. The screen branch is rebased onto that commit and published as `feat/112-event-day-check-in-screen-linear` (initial head `641a3ac`). The earlier remote screen branch remains unchanged.
- Status: T1–T3 committed; this screen slice is published for a draft PR to `dev`, not merged. Its pre-tracking-correction `dev...screen` diff had six files (+789/−10) with no backend changes; the PR diff includes this tracking update. The later authorized-event entry is a separate slice, not part of this PR.
- Review workload: the screen and its 370-line browser test are cohesive but exceed the advisory 400-line budget. Review the route/boundary first, then the operator state machine and browser cases; do not separate tests from behavior merely to reduce the count.

## Objective and boundaries

Give authenticated, event-authorized admins a usable event-day search and check-in surface. #64 check-in commands and #102 protected participant search are integrated; PR #118 added the minimal event-scoped attendance projection: event check-in timestamp or null and per-enrolled-activity check-in timestamp or null, never actor/session data. The merged backend joins only within the authorized event. The frontend must distinguish registration confirmation from attendance, permit activity admission only after event admission and matching eligible enrollment, and announce success only after a durable successful POST response. Duplicates, stale/concurrent requests, denials, loading, and errors get truthful states and safe handoff. No overrides, refunds, payment or registration writes, QR/PIN, exports or offline sync; #65 owns printable fallback and #104 owns corrections.

## Tasks

- [x] T1 — Add minimal event-scoped attendance projection to protected paginated registration search; test event/activity status, authorization, isolation and no sensitive metadata. Test-first RED/GREEN where PostgreSQL E2E runner works; verify backend checks. Route: delegated writer (multi-file write and preparation). Commit as one backend work unit. Status: done.
- [x] T2 — Build authenticated event-specific operator search and check-in screen consuming T1; test status distinctions, ordering, matching eligibility, response-confirmed success, duplicates, denied/error/loading and mobile access. Test-first RED/GREEN where browser runner works; verify frontend checks. Route: delegated writer (multi-file write and preparation). Commit as one frontend work unit. Status: done.
- [x] T3 — Cross-slice verification and review workload readback; run applicable integration/browser checks, record limitations and next delivery decision. Route: delegated verifier for cross-slice commands; no push or PR. Status: done.

## Acceptance and evidence

- Authorized event admin can search registrations and read only that event's current attendance; wrong-event, unauthenticated and wrong-role requests leak nothing. Status response excludes check-in actor/session and payment data.
- UI shows confirmed registration, event attendance, and per-eligible-enrollment activity attendance separately; activity command is offered only after event attendance. General admission does not imply activity admission.
- Success requires backend confirmation; duplicate/denied/error responses do not falsely claim a new success. Re-fetch status after POST to resolve stale/concurrent state; no implicit mutation of registration/payment.
- Desktop/mobile loading, empty, denied, error, and handoff states covered by backend and browser checks.
- T1 evidence: PostgreSQL E2E RED before implementation (missing status fields), GREEN 4/4 search tests; independent verifier 15/15 search + check-in E2E, backend lint and build passed. Commit `7d5005eded6bebc23c8b3ae60b8d4075eeede6ce` (`feat(check-in): project scoped attendance in participant search`). Native committed assessment: medium, review deferred (`under_budget`), 206 authored lines. No review authority consumed.
- T2 evidence: route absent RED 6/6 browser tests, GREEN 6/6; correction RED route transition/POST denial, GREEN 10/10; independent verifier 16/16 focused browser tests, frontend lint/build passed. Commit `a9d7d4671717adea477716f1c1e78d3dd9c5990f` (`feat(check-in): add protected event-day operator screen`). Native medium slice review approved and exact acknowledgement burned lineage `review-39e23036315dfc47`; two informational warnings, no correction required. Browser API tests are mocked; real server-side abort behavior not exercised.
- T3 evidence: full PostgreSQL E2E 54/54 (9 suites) and Chromium browser 29/29 passed; backend/frontend builds and lint passed earlier. Initial formatting check failed on three new/changed files; normalized them, then Prettier check passed and focused 4 backend + 10 browser tests passed. `git diff --check` passed. Formatting-only work-unit commit `fc34d3d0940685f3484468e63e9be1cf75a43dc5`. Full browser suite mocks API; no live frontend-to-backend browser integration or real abort semantics exercised. PostgreSQL suite logged expected test constraint rejections but finished green. An initial consent binding expired without creating a lineage; fresh native review of the formatting/tracking slice approved and exact acknowledgement burned lineage `review-2181bfdf49803e4c`.

## Screen-slice validation and next step

- After rebasing onto `dev`, focused Chromium browser checks passed 10/10, frontend build and changed-file Prettier checks passed, and lint passed with two effect-cleanup warnings at `admin-check-in-page.tsx:66–69`. Diff whitespace checks passed. The full PR CI has not run yet.
- The route is registered behind `AdminSessionBoundary`, but `/admin` has no entry link in this slice. The separate event-entry slice adds discoverability; this PR does not claim a complete operator journey by itself. Browser cases mock the API, and the automated real-server success/denial criterion for #112 remains open; a prior manual live success run on a later branch does not satisfy it.
- Open this screen slice as a draft PR to `dev` with `Refs #112`, exactly one `type:feature` label, and explicit review-size and access limitations. Wait for its required CI and human review before a separate merge decision; keep #112 open and re-evaluate the later entry branch against the integrated `dev`.
