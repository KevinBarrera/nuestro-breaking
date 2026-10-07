# CI checks that stay fast and useful as the project grows

## Tracking

- Engram mirror: `odd/ci-fast-useful-checks/tasks`
- Base: `dev` at `b0d1206` (after #152)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `b0d1206`.

## Objective

Keep every PR check meaningful and the wall-clock time low when the project grows 10–20x. Today, every PR runs all eight jobs. Almost all frontend logic is tested through the browser, which is the slowest test layer.

## Why

- 171 runs in the 30 days before 2026-10-07: ~14 billed minutes per run, ~2,200–2,500 min/month. The private free plan includes 2,000.
- E2E time grows linearly with the test count: ~4 min today, ~40 min at 10x on one worker. Shards keep the wait flat, but each shard repeats ~1.5 min of fixed setup.
- The frontend has no unit runner. `admin-event-catalog.spec.ts` runs `parseMxnToCents` inside Playwright as a stopgap.
- The `edited` trigger re-runs the whole suite when a PR title or description changes. Only the branch-flow guard needs it.

## Constraints

- Branch protection and rulesets are unavailable on this private free plan (HTTP 403), so GitHub does not enforce required checks. Keep stable check names anyway, so they work if protection is enabled later.
- A push to `dev` always runs the full suite.
- Any changed file outside `apps/backend/**`, `apps/frontend/**` and the docs (`docs/**`, `odd/**`, `openspec/**`, `*.md`) runs everything. If change detection fails, every area runs.
- Third-party actions are pinned by commit SHA: `dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d` (v4.0.3).
- No GitHub repo settings change without the user's approval.

## Slices and tasks

Forecast: ~900 authored lines over 3 PRs.

### PR 1 — `ci/split-guard-and-path-filters`

- [x] T1 — Move `quality / branch-flow-guard` to its own workflow, which keeps the `edited` trigger. Remove `edited` from `pr-checks.yml`.
- [x] T2 — Add a `changes` job (paths-filter) with `backend` and `frontend` outputs. Backend jobs run only on backend changes, and frontend jobs only on frontend changes. `live-check-in` runs on either. On pushes to `dev`, everything runs. The `frontend / playwright` aggregator succeeds when its shards are skipped and fails when any shard fails. Update the docs.

### PR 2 — `test/frontend-unit-runner`

- [x] T3 — Add Vitest to `apps/frontend`, reusing the Vite config and the `@` alias, plus a `test` script. Add unit tests for `money.ts`, `zoned-time.ts`, `roles.ts` and `readers.ts`. Run unit tests in `frontend / lint-build` and in root `verify:pr`. Update `docs/frontend-architecture.md` and `docs/code-quality.md`.
- [x] T4 — Move pure-logic e2e assertions to unit tests: the agenda model, the overview model, the in-Node money parser test, and the session-store probe. That last move removes the dev-server re-run step in shard 1. E2E keeps one flow-level assertion per screen.

### PR 3 — `ci/sweeps-off-pr-path`

- [x] T5 — PR shards skip the accessibility and phone-width sweeps (`NB_E2E_SKIP_SWEEPS=1` → Playwright `testIgnore`). A push to `dev` runs the full suite. The nightly schedule was dropped: scheduled workflows run on the default branch (`main`), so they would test stale code, and every merge to `dev` already runs the sweeps. Per-feature 375/390px checks stay on PRs. Update the docs.

## Checks

- Workflow edits: YAML parses (`yq`/`node`), plus a CI run on the PR itself. A backend-only commit skips the frontend jobs, and the run on the PR shows which jobs ran.
- Unit runner: `pnpm --filter frontend test`, `lint` and `build`. The full e2e suite stays green with the same number of covered behaviors.

## Progress

- 2026-10-07: #152 merged (`b0d1206`). Feature document created. Branch `ci/split-guard-and-path-filters` created from `dev`.
- 2026-10-07: PR 1 is #153 (route: delegated writer, then an inline follow-up fix). Commits: `93c6249` (T1), `5d027ab` (T2), `c78e6fd` (plan), `9151a5a` (fail-safe follow-up from review findings: unclassified files and failed change detection run every area). Native reviews `review-037af3d9921f537b` (T1+T2, high, granted, approved) and a second high-risk review of `9151a5a` (granted, approved), both acknowledged. Open suggestions: the `predicate-quantifier` comment and the README "outside `apps/`" wording.
- Checks: YAML parses, `pnpm format:check` passes, and all 10 checks on #153 pass. Throwaway backend-only PR #154 (closed): `frontend / lint-build` and the Playwright shards were skipped, `frontend / playwright` passed, and the backend and live jobs ran.
- Next: T3 on `test/frontend-unit-runner`, stacked on `ci/split-guard-and-path-filters`.
- 2026-10-07: PR 2 `test/frontend-unit-runner` (route: delegated writer). Commits: `c170024` (T3), `dd5461f` (T4). `vitest@^5.0.3` runs 7 files and 105 tests in about 0.3s. E2E went from 140 to 133 tests (1 catalog, 4 agenda and 2 overview tests became unit tests or one flow test each). Every new test file was mutation-checked once. Deviation: the session-store dev-server probe and its CI re-run stay. Signing out has no UI reader of the store, so only that probe proves `clearSession()` is wired; `session-store.test.ts` covers the store itself. Native review (high, granted) approved and acknowledged. Open suggestions: comment the state reset in the merged agenda flow test, type the overview fixture `status`, and note that the Intl strings depend on the Node CLDR data.
- Next: T5 on `ci/sweeps-off-pr-path`, stacked on `test/frontend-unit-runner`.
- 2026-10-07: PR 3 `ci/sweeps-off-pr-path` (route: inline; 3 files, 10 lines). Commit `0c33b58` (T5). `playwright test --list` shows 109 tests with `NB_E2E_SKIP_SWEEPS=1` and 133 without. Format, YAML and build pass. Native review (high, granted) approved and acknowledged. Accepted tradeoff (R3-001): a PR that breaks a sweep is caught on the next push to `dev`, not before merge. Open suggestions: use one term for the sweeps, and guard the hardcoded sweep filenames.
- Next: wait for green CI on #153, #155 and the PR 3 PR, then the user merges them in order (#153 → #155 → PR 3), using rebase onto dev and a merge commit.
