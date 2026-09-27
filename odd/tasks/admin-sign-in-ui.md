# Admin sign-in UI polish

## Tracking

- GitHub issue: #90 — Polish admin sign-in UI
- Branch: `feat/admin-sign-in-ui`
- Follows: #88 — Add frontend admin sign-out

## Goal

Replace the bare admin signed-out screen with a polished, usable UI that matches the event-inspired visual direction and is appropriate for the MVP admin surface.

## Tasks

- [x] Inspect the screenshot and current admin session boundary UI.
- [x] Create approved GitHub issue and ODD tracking.
- [x] Add RED frontend coverage for the improved sign-in visual/UX structure.
- [x] Implement the polished responsive sign-in UI.
- [x] Verify focused frontend checks and repository formatting.
- [x] Run RDD review and prepare delivery summary.

## Constraints

- Preserve backend session/sign-in/sign-out behavior.
- Keep accessible form labels, keyboard behavior, loading state, disabled state, and safe error copy.
- Do not add backend auth changes, password recovery, public registration, role administration, payments, QR/PIN/check-in credentials, or broader admin event list workflow.
- Conversation is Spanish, but code, tests, and repository artifacts remain in project style.

## Evidence

- Screenshot showed a sparse full-screen state: small form text near the top center, fields rendered poorly, no visible card, hierarchy, contextual message, or strong primary action.
- Before implementation, `AdminSessionBoundary` used a minimal `<main>` and unstyled form controls for the signed-out state.
- RED: `corepack pnpm --filter @nuestro-breaking/frontend test:e2e -- route-placeholders.spec.ts` failed 2 new tests: missing branded sign-in region and missing helpful safe keyboard-submission error copy (12 existing tests passed).
- GREEN: same command passed 14 tests after adding a centered responsive branded panel, labeled styled inputs, prominent submit button, access note, and safe error message. The Playwright command selects the 10 route placeholder tests plus 4 admin foundation e2e tests under the current config.
- `corepack pnpm --filter @nuestro-breaking/frontend lint`: passed after removing DOM evaluation from the test assertions.
- `corepack pnpm format:check`: passed after formatting the touched files.
- Independent verification initially flagged ambiguous test-count evidence; the task file now explains that the Playwright command selects 10 route placeholder tests plus 4 admin foundation tests under the current config.
- RDD native review approved and was acknowledged: `review-575fcbcd49c28aa5`.
