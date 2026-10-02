# Admin workspace shell — issue #116

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/116
- Branch: `feat/116-admin-workspace-shell` from `dev` at `80b2fbd`
- Status: in progress; no delivery authorized.

## Goal and scope

Give authenticated admin/judge users a responsive, accessible shared header and honest navigation across existing admin routes, integrating the current sign-out action. `/admin` is the only destination reachable without a known event ID. Keep its sample/planning data visibly non-live. Preserve backend-backed access checks, CSRF sign-out, and failure retention. Do not add metrics, a design system, event index, registration/check-in UI, or backend behavior.

## Tasks

- [ ] T1 — Build the shared authenticated admin shell with integrated sign-out and honest active `/admin` navigation, with route/access and sign-out browser coverage. Test-first when the existing Playwright runner supports a meaningful RED. Commit a coherent work unit. Status: in progress.
- [ ] T2 — Harden the responsive header and failure states with keyboard and narrow-screen browser checks, and confirm planning-view distinction. Test-first when applicable. Run frontend lint/build and format checks, then commit the work unit. Status: pending.

## Acceptance and evidence

- Keyboard-accessible header identifies the current admin page on desktop and narrow screens; only usable destinations are linked.
- Protected content stays inaccessible before successful admin/judge session validation.
- Failed sign-out reports an error while retaining the protected view; successful sign-out exits it.
- Planning/sample content is not presented as live operational data.
- T1: shared header, single `/admin` link and integrated sign-out added to authenticated boundary; route and access assertions included on both existing admin routes. Corrected Playwright invocation passed 16/16 focused browser tests. Frontend lint, build, repository format check and `git diff --check` passed.
- T1 test-first RED was unavailable: two incorrect Playwright artifact/flag invocations failed before tests began; no RED or GREEN was observed by the writer. A separate verifier then ran all 16 focused tests successfully. Do not claim a RED cycle.
- T1 commit identity: pending work-unit commit.
- T2 mobile/keyboard/failure checks and commit identity: pending.

## Next step

Commit verified T1 code, tests and current tracking; record commit identity, then start T2.
