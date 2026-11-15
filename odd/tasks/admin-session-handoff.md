# Admin session handoff

Objective: keep account activation and stale tabs from acting as another admin's session (#392, MVP tracking #57).
Branches: chained from `dev` at `367f56e`, one per slice (`fix/392-0N-…`). Delivery: chained PRs per slice, `Closes #392` on the last PR, no `Co-Authored-By`.
Test runners: backend Jest unit and PostgreSQL e2e (`pnpm --filter @nuestro-breaking/backend test`, `test:e2e`); frontend Vitest and Playwright (`pnpm --filter @nuestro-breaking/frontend test`, `test:e2e`). Use Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).

## Specs

Quoted from the acceptance criteria of #392.

- **S1** "Activating an account in a browser signed in as another admin does not show that admin's panel; the activated email is offered for sign-in and the existing session is called out. Playwright coverage."
- **S2** "Signing in while another session cookie is present revokes the previous session and audits it. Backend unit and PostgreSQL e2e coverage."
- **S3** "An admin screen that receives `401` returns to the sign-in form with a session-ended notice; `403` keeps the "Sin acceso" message. Vitest for the status mapping, Playwright for the flow."
- **S4** "After signing out in one tab, another open admin tab no longer acts as that session on its next request or focus. Playwright coverage."
- **S5** "docs/contracts/admin-auth-boundary.md (and ADR 0002 if the decision changes) describes the one-session-per-browser behavior, activation with an existing session and stale-tab handling."

Design (assumptions, within the issue scope):

- S1/S4 share one "account in use" screen in the session boundary: it names the open session's account and offers to continue with it or sign it out. After activation it always shows when a session exists; on focus it shows when the session's user differs from the one this tab displays.
- S3: admin clients report a `401` through one signal in `shared`; the boundary listens, clears the session and shows the sign-in form with a session-ended notice. `403` mapping stays as is.
- S4: the boundary re-checks `GET /auth/session` when the tab regains focus or visibility.

## Tasks

| ID  | Specs | Task                                                                                      | Route  | Status  |
| --- | ----- | ----------------------------------------------------------------------------------------- | ------ | ------- |
| T1  | S2    | Backend: sign-in revokes the session in the request's cookie and audits `session_revoked` | inline | done    |
| T2  | S3    | Frontend: `401` signal from admin clients ends the session with a notice                  | inline | pending |
| T3  | S1 S4 | Frontend: re-check on focus and "account in use" screen after activation or user change   | inline | pending |
| T4  | S5    | Docs: contract (and ADR note) for one session per browser, activation and stale tabs      | inline | pending |

Route evidence: each task is one unit under ~200 lines with no parallel partner, so no writer trigger fires; T1 names high-risk item 2 (auth) and gets its own commit and slice.

## Log

- **L1** (2026-11-15) User: "Genial, pues trabajemos ahora en el fix de ese issue" (issue #392, drafted from the reproduction in this session).
- **L2** Mapping: no shared 401 helper (six entity clients plus the check-in page fold 401/403 into `denied`; admin-event and admin-registration keep `unauthorized`/`forbidden`); no cross-tab or focus sync; `SessionAccessService.sessionToken` is private.
- **L3** T1: RED observed (old cookie still 200 after a new sign-in). GREEN: `test/auth-session` 10/10, backend unit 653/653, lint clean, full backend e2e 553/553. Independent verifier: S2 PASS, no blockers; applied its note (skip already expired sessions) and added its two probes (no-role sign-in keeps the session; expired session is not revoked or audited).
