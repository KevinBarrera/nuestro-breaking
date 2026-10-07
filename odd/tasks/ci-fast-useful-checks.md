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
- Changes to shared inputs run everything: `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, `.github/**`.
- Third-party actions are pinned by commit SHA: `dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d` (v4.0.3).
- No GitHub repo settings change without the user's approval.

## Slices and tasks

Forecast: ~900 authored lines over 3 PRs.

### PR 1 — `ci/split-guard-and-path-filters`

- [ ] T1 — Move `quality / branch-flow-guard` to its own workflow, which keeps the `edited` trigger. Remove `edited` from `pr-checks.yml`.
- [ ] T2 — Add a `changes` job (paths-filter) with `backend` and `frontend` outputs. Backend jobs run only on backend changes, and frontend jobs only on frontend changes. `live-check-in` runs on either. On pushes to `dev`, everything runs. The `frontend / playwright` aggregator succeeds when its shards are skipped and fails when any shard fails. Update the docs.

### PR 2 — `test/frontend-unit-runner`

- [ ] T3 — Add Vitest to `apps/frontend`, reusing the Vite config and the `@` alias, plus a `test` script. Add unit tests for `money.ts`, `zoned-time.ts`, `roles.ts` and `readers.ts`. Run unit tests in `frontend / lint-build` and in root `verify:pr`. Update `docs/frontend-architecture.md` and `docs/code-quality.md`.
- [ ] T4 — Move pure-logic e2e assertions to unit tests: the agenda model, the overview model, the in-Node money parser test, and the session-store probe. That last move removes the dev-server re-run step in shard 1. E2E keeps one flow-level assertion per screen.

### PR 3 — `ci/sweeps-off-pr-path`

- [ ] T5 — Tag the accessibility and phone-width sweeps `@sweep`. PR shards run `--grep-invert @sweep`. A push to `dev` and a nightly schedule run the full suite. Per-feature 375/390px checks stay on PRs. Update the docs.

## Checks

- Workflow edits: YAML parses (`yq`/`node`), plus a CI run on the PR itself. A backend-only commit skips the frontend jobs, and the run on the PR shows which jobs ran.
- Unit runner: `pnpm --filter frontend test`, `lint` and `build`. The full e2e suite stays green with the same number of covered behaviors.

## Progress

- 2026-10-07: #152 merged (`b0d1206`). Feature document created. Branch `ci/split-guard-and-path-filters` created from `dev`.
