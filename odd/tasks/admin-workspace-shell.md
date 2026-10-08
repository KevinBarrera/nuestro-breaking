# Admin workspace shell — issue #116

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/116
- Branch: `feat/116-admin-workspace-shell` from `dev` at `80b2fbd`
- Status: visual refinement implemented and verified; publication remains paused pending review and user visual feedback.

## Goal and scope

Give authenticated admin/judge users a responsive, accessible shared header and honest navigation across existing admin routes, integrating the current sign-out action. `/admin` is the only destination reachable without a known event ID. Keep its sample/planning data visibly non-live. Preserve backend-backed access checks, CSRF sign-out, and failure retention. Do not add metrics, a design system, event index, registration/check-in UI, or backend behavior.

## Tasks

- [x] T1 — Build the shared authenticated admin shell with integrated sign-out and honest active `/admin` navigation, with route/access and sign-out browser coverage. Test-first when the existing Playwright runner supports a meaningful RED. Commit a coherent work unit. Status: done.
- [x] T2 — Harden the responsive header and failure states with keyboard and narrow-screen browser checks, and confirm planning-view distinction. Test-first when applicable. Run frontend lint/build and format checks, then commit the work unit. Status: done.
- [x] T3 — Refine the shared header's visual hierarchy and alignment against the supplied wide-screen screenshot without changing routes, session semantics or page content; update relevant browser assertions and verify desktop/mobile. Commit the visual work unit. Status: done.

## Acceptance and evidence

- Keyboard-accessible header identifies the current admin page on desktop and narrow screens; only usable destinations are linked.
- Protected content stays inaccessible before successful admin/judge session validation.
- Failed sign-out reports an error while retaining the protected view; successful sign-out exits it.
- Planning/sample content is not presented as live operational data.
- T1: shared header, single `/admin` link and integrated sign-out added to authenticated boundary; route and access assertions included on both existing admin routes. Corrected Playwright invocation passed 16/16 focused browser tests. Frontend lint, build, repository format check and `git diff --check` passed.
- T1 test-first RED was unavailable: two incorrect Playwright artifact/flag invocations failed before tests began; no RED or GREEN was observed by the writer. A separate verifier then ran all 16 focused tests successfully. Do not claim a RED cycle.
- T1 commit identity: `b5c490236dcdc85e3d211d5b310a3863b912ceaa` (`feat(admin): add authenticated workspace shell`).
- T2: new browser cases at 375px verify keyboard focus and visible outlines on both admin routes, no horizontal overflow, available navigation, failed sign-out retaining protected content and a successful retry, and non-live planning labels. Existing header passed without behavior changes; test-first RED was not applicable because tests passed before a fix. Focused Playwright passed 19/19; frontend lint/build, format and `git diff --check` passed.
- T2 commit identity: `c5902c118817737672e4673789babd8e5da137a9` (`test(admin): cover narrow workspace and sign-out retry`).
- T3: reduced duplicate brand/title hierarchy, aligned header to the page's `max-w-6xl`, made active navigation explicit and sign-out secondary, and removed raw event ID from the header. Kept original session and sign-out behavior. Focused Playwright 19/19 passed (writer and independent spot check), frontend lint/build, format and `git diff --check` passed. Backend-backed sign-out was not exercised by these mocked browser tests. Visual refinement has no meaningful deterministic RED, so no RED cycle is claimed.
- T3 commit identity: `8931a59c9f35d33d50b1b2a69e3855aa4b457e3b` (`style(admin): refine workspace header hierarchy`).

## Next step

Inspect native review authority for the T3 work unit; share the visual changes with the user before resuming push/PR.
