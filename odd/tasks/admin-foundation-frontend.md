# Admin foundation frontend integration

## Tracking

- GitHub issue: #60 — Define event and activity foundation
- Branch: `feat/60-admin-foundation-frontend`
- Upstream backend WU: PR #76 / merge commit `a6d1fb7b5cce793e2d35bede7e383aa21e17d9d3`

## Goal

Connect the admin frontend to the first real backend event/activity foundation endpoint so the project has an observable frontend/backend read flow.

## Selected route strategy

Use a specific event route instead of hiding the event identity behind the generic dashboard:

```text
/admin/events/:eventId/foundation
```

Rationale: this keeps the first integration honest. The backend endpoint requires an event id, and there is not yet a selected event list, seed, auth context, or admin dashboard data source. A route parameter lets the UI render real persisted data when an event id exists, while `/admin` can remain a sample/planning dashboard.

## Tasks

- [x] Explore current frontend route structure, admin page, and auth planning context.
- [x] Add a frontend route that reads `GET /admin/events/:eventId/foundation`.
- [x] Render loading, success, empty, and safe failure states without adding auth or CRUD.
- [x] Verify frontend checks and record evidence.
- [x] Commit work unit after approval.

## Auth notes

Auth is contemplated but not implemented. Existing docs mention identity/access as a planned bounded context, and `RoleAreaBoundary` is intentionally a future hook with no enforcement. There is no dedicated open auth issue observed in the current issue list; related upcoming issues are registration/check-in/foundation issues #61-#65, but auth itself should be its own approved slice before protected workflows depend on it.

## CRUD notes

The current event/activity line is read-only. A full CRUD frontend/backend flow is appropriate only after the team selects the actual admin authoring workflow and access boundary. For the MVP, useful non-blocked work is still possible before full CRUD: read model, route integration, auth boundary, event-window containment, and registration lifecycle foundations.

## Constraints

- Do not add registration, payments, check-in, authorization enforcement, scoring, publication, or pilot-readiness semantics.
- Do not invent a seed event or hard-code a production event id.
- Keep `/admin` behavior unless a focused route change requires otherwise.
- Preserve Spanish UI copy.

## Evidence

- Initial exploration: frontend uses React Router with `routes.admin = '/admin'`, a static Spanish `AdminPage`, and `RoleAreaBoundary` that records allowed roles but intentionally does not enforce auth.
- Strict TDD RED: added Playwright coverage for the endpoint-backed route and state handling first; the new tests failed because `/admin/events/:eventId/foundation` did not exist yet.
- GREEN implementation: added `/admin/events/:eventId/foundation`, fetched the backend endpoint using the route `eventId`, rendered Spanish loading/success/empty/safe failure states, and kept `/admin` as the sample dashboard.
- Verification: `corepack pnpm --filter @nuestro-breaking/frontend test:e2e` passed (5 tests); `corepack pnpm --filter @nuestro-breaking/frontend lint` passed; `corepack pnpm --filter @nuestro-breaking/frontend build` passed; `corepack pnpm format:check` passed; `git diff --check` passed. Node engine warning persisted: repository wants Node v24.18.1, host uses v24.19.0.
- Risk: Playwright uses mocked endpoint responses; live backend integration still requires a running backend and a real persisted `eventId`. Without `VITE_API_BASE_URL`, the frontend targets `http://localhost:3000`.
- Work-unit commit: `64815f3` — `feat(frontend): read event foundation from backend`.
