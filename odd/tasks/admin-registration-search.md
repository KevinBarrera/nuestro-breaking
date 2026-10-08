# Admin registration search

## Tracking

- GitHub issue: #102 — Add event-scoped admin participant search
- Branch: `feat/102-admin-registration-search`
- Follows: #63 admin registration operations scope, #101 audit/correction policy, #61 registration lifecycle states, #62 participant registration model, and admin auth boundary work.

## Goal

Add the protected backend read surface an authorized admin operator needs to search event-scoped participant registrations before manual registration, cash confirmation, correction, check-in, or exports consume registration data.

## Tasks

- [x] Map issue #102, current contracts, backend auth, registration persistence, and API/test patterns.
- [x] Add RED backend e2e coverage for protected event-scoped search.
- [x] Implement the backend search endpoint, service, and response shape.
- [x] Verify focused backend checks and repository formatting.
- [x] Run independent verification and RDD review.
- [ ] Prepare delivery summary for maintainer review.

## Constraints

- Enforce active server-side session, admin-capable role, and event scope.
- Deny unauthenticated, wrong-role, and wrong-event access without exposing participant or event data.
- Search only stored participant/registration lookup fields: full name, email, stage name, and event-scoped folio.
- Return only participant, event registration lifecycle, folio, and same-event activity summary needed for admin decisions.
- Keep responses bounded and paginated.
- Do not implement writes, corrections, check-in, attendance, exports, public registration search, payment-provider data, audit-history data, or UI in this slice.

## Evidence

- Issue #102 acceptance criteria require safe denials, authorized event-scoped lookup, a response shape that avoids payment/check-in/export/audit-history data, and safe duplicate/no-result handling.
- `docs/contracts/admin-registration-operations.md` defines search/read roster as the read-only admin operation before write workflows.
- `docs/contracts/admin-registration-audit-policy.md` confirms #102 can proceed independently because it is read-only; #103/#104 remain blocked by organizer decisions.
- Current persistence from #61/#62 has participants, event registrations, lifecycle status/source/time, event-scoped folio, and event activity registrations. Search must expose lifecycle status but not payment-provider, audit, check-in, or export data.
- Existing protected admin event foundation uses `SessionAccessService.authorizeEvent` through `EventFoundationGuard`; search reuses the same server-side session and event-scope boundary.
- The read-only `GET /admin/events/:eventId/participants` endpoint requires `q` of 2–200 trimmed characters, defaults to 20 results, caps limit at 50, and uses deterministic folio/id tie-breaking with event-constrained activity summaries. RED e2e returned 404 for the missing route before implementation; GREEN e2e passed 3 tests. Backend lint, TypeScript, repository formatting, and `git diff --check` passed.
- Independent read-only verifier passed with no blocking findings, covering authorization, event-constrained joins, wildcard escaping, response-field exclusions, duplicates, no-results, and pagination. The verifier did not rerun commands; local command evidence above is the execution record.
