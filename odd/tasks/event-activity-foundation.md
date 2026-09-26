# Event and activity foundation

## Tracking

- GitHub issue: #60 — Define event and activity foundation
- Branch: `feature/60-event-activity-foundation`

## Goal

Define the reusable event/activity foundation for the November MVP without treating the draft MVP proposal as approved, and add a small visible admin preview so progress is observable.

## Tasks

- [x] Create traceable branch and ODD tracking.
- [x] Document/represent event and activity foundation with organizer-dependent fields configurable or deferred.
- [x] Add a clearly labeled admin UI preview using sample event/activity data.
- [x] Verify focused frontend checks and readback evidence.

## Constraints

- Do not mark the November MVP proposal as approved.
- Do not implement payment, registration, check-in, authorization, or live persistence wiring in this slice.
- Keep UI preview clearly illustrative/sample-based.
- Prefer reusable event/activity language: event, activity, type/kind, schedule, venue, price display, capacity/status.

## Evidence

- Branch observed: `feature/60-event-activity-foundation`; `/admin` retains its PageShell props and shows a static draft event with two sample activities. The November MVP proposal is explicitly not approved.
- Strict TDD RED attempt (before implementation): `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` failed before tests ran because Playwright's web server command invoked bare `pnpm`, which was unavailable in the shell (`/bin/sh: pnpm: command not found`). No behavioral RED was observed.
- Fixed the Playwright web server command to use `corepack pnpm exec vite`, matching this repo's Corepack-based package-manager usage.
- Post-implementation: `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` passed with 2 tests; `corepack pnpm --filter @nuestro-breaking/frontend lint` passed; `corepack pnpm --filter @nuestro-breaking/frontend build` passed; `git diff --check` passed. The pnpm commands emitted the existing Node engine warning because this host uses Node v24.19.0 while the repo wants v24.18.1.
- Review correction: `/admin` now uses Spanish throughout its visible preview, including PageShell text, sample event/activity details, and planning/draft indicators. The illustrative event palette is limited to small accents against softer surfaces; the proposal is still explicitly unapproved and organizer-dependent fields remain configurable or deferred. No live data or workflow wiring was added.
- Strict TDD review RED: updated Spanish Playwright assertions first; `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` failed on missing “Administración” against the old English UI (dancer test passed). GREEN: after updating the UI, the same command passed with 2 tests.
- Dashboard design iteration (user-approved): replaced the centered admin hero/card with a compact dark slate dashboard header, distinct event summary and nested activity section, scannable label/value metadata, amber draft/pending badges, cyan planning information, and restrained orange/magenta accents. This remains a static Spanish sample; organizer-dependent fields are still configurable/deferred and the November proposal is not approved. No workflows, routing, or live data were added.
- Dashboard Strict TDD RED: updated Playwright assertions for event/activities grouping, summary label/value content and conceptual planning status before implementation; `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` failed at the missing event summary article’s “Fecha ilustrativa” (admin failed; dancer passed). GREEN: after implementing the dashboard, the same command passed with 2 tests. Final verification: `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` passed (2 tests), `corepack pnpm --filter @nuestro-breaking/frontend lint` passed, `corepack pnpm --filter @nuestro-breaking/frontend build` passed, and `git diff --check` passed. Node engine warning persisted (host v24.19.0 vs required v24.18.1).
- Work-unit commit: `6cdae30` — `feat(frontend): preview event activity foundation`.
