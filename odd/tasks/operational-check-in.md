# Operational check-in — issue #64

## Goal

Provide durable, event-scoped attendance evidence for valid registrations, including enrolled workshop/competition activities, without changing registration or payment state. Source: https://github.com/KevinBarrera/nuestro-breaking/issues/64 and organizer answers in #58.

## Scope and constraints

- Event check-in is distinct from registration and records server time and authenticated actor; each confirmed event registration can check in once.
- Activity check-in is for an enrolled activity in the same event; a general-pass-only registration has no activity enrollment and only receives event check-in. Do not infer a product type from absent product schema.
- Use current event-admin mutation authority for MVP; do not invent staff roles or exception approval policy. Pending/voided, wrong-activity, and other exceptions receive an explicit denial for authorized human resolution, with no silent registration/payment change.
- No frontend, provider/payment reconciliation, refunds, transfer, or general correction workflow. Keep changes on `feat/64-operational-check-in` and do not push or open a PR without user decision.
- TDD: enabled from repository `openspec/config.yaml` (`strict_tdd: true`); focused runner `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand test/check-in.e2e-spec.ts`, full backend e2e `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand`. Capture real RED/GREEN/REFACTOR evidence.
- Delivery strategy: ask-on-risk; user selected stacked PRs toward `dev` (`stacked-to-main`) for the forecast ~650–950 authored changed lines across persistence, API, e2e, and contract documentation (generated migration metadata excluded). Each independently verifiable work unit targets `dev` after its prerequisite merges; do not open PRs without separate user authorization. No cosmetic shrinking.

## Tasks

- [ ] CI64-1 — Persist and expose authenticated event-level check-in. Add database invariants and event-scoped command; deny unconfirmed/voided/wrong event without mutation. Check: PostgreSQL-backed e2e covers success, duplicate, server actor/time, auth, and denials; backend lint/build and focused test. Status: in progress; focused E2E 5/5, migration replay 15/15, full E2E 47/47, focused ESLint, no-emit build typecheck, and repository format check passed; independent verification pending. Commit: pending; RDD: pending.
- [ ] CI64-2 — Add activity-level check-in bound to same-event enrollment and preserve exception safety. Check: PostgreSQL-backed e2e covers enrolled workshop/competition, unenrolled/other-event/general-only, repeat and unauthorized cases, with no registration/payment mutation; update relevant contract docs and run backend e2e/full checks. Status: pending. Commit: pending; RDD: pending.

## Evidence / next step

Base `dev` at `50f7592`; clean branch created. Issue #64 remains open and `status:ready`. Scout mapped `apps/backend/src/database/schema/`, `apps/backend/drizzle/`, `apps/backend/src/events/`, `apps/backend/test/`. CI64-1 worker produced event-level implementation (8 paths, ~305 added lines); RED 5/5 failed with 404 before implementation, GREEN 5/5 passed. Migration replay test RED 1/15 (expected 8, got 9) then GREEN 15/15 after adjusting `apps/backend/test/event-activity-foundation.e2e-spec.ts`. Direct full Jest E2E 9 suites/47 tests passed; focused ESLint, no-emit typecheck, and repository Prettier check passed. The script-form `test:e2e -- --runInBand` treated the flag as a pattern and ran no tests, so use the direct Jest command above. Precommit native assessment was unassessable due to untracked scope; independent verifier is running. No commits or PRs.
