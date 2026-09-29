# Admin sign-out

## Tracking

- GitHub issue: #88 — Add frontend admin sign-out
- Branch: `feat/admin-sign-out`
- Follows: #86 — Integrate frontend admin routes with backend session

## Goal

Complete the frontend admin session loop by allowing an authenticated admin/judge to sign out through the existing backend `POST /auth/sign-out` endpoint.

## Tasks

- [x] Audit current exposed admin/backend routes and identify the smallest incomplete auth flow.
- [x] Create approved GitHub issue and ODD tracking.
- [x] Map existing frontend session tests and CSRF handling.
- [x] Add RED frontend tests for admin sign-out behavior.
- [x] Implement frontend sign-out API and UI control.
- [x] Verify focused frontend checks and repository formatting.
- [x] Prepare delivery summary and await commit/PR approval.

## Constraints

- Preserve existing sign-in/session behavior and backend auth/session behavior.
- Use backend session credentials and session-bound CSRF requirements for sign-out.
- Clear frontend session state after successful sign-out and return to signed-out UI.
- Do not add public registration, password recovery, role administration UI, payment authorization, QR/PIN/check-in credentials, or broader admin event list workflow.

## Evidence

- Read-only audit found no unguarded admin data API remains: only `GET /admin/events/:eventId/foundation`, guarded by `EventFoundationGuard`, exposes admin event data.
- Frontend gap addressed: `signOut` fetches `GET /auth/session` with credentials to read its exposed `X-CSRF-Token` response header, then posts to `/auth/sign-out` with credentials and that header. The boundary clears the local session and renders sign-in only after success; failed or missing-CSRF sign-out leaves the admin view intact. No raw cookie, credential, or CSRF token is stored in frontend session state.
- RED: the new Playwright test timed out waiting for the absent “Cerrar sesión” button. GREEN: the sign-out success and missing-CSRF Playwright cases passed after implementation and CORS-aware session-header mocking.
- Verified: `corepack pnpm --filter @nuestro-breaking/frontend test:e2e -- route-placeholders.spec.ts` (12 passed; Playwright also selected the admin foundation e2e file under the current config), `corepack pnpm --filter @nuestro-breaking/frontend lint` (passed), and `corepack pnpm format:check` (passed).
- Issue #88 created and labeled `type:task`, `area:frontend`, `area:admin`, `status:ready`, `risk:low`, and `mvp:foundation`.
