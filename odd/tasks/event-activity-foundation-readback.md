# Event activity foundation readback

## Tracking

- GitHub issue: #60 — Define event and activity foundation
- Branch: `docs/60-foundation-readback`

## Goal

Update the issue #60 documentation readback after the backend API, frontend read flow, and event-window containment work were merged, so the issue can be closed or moved to Done with accurate evidence.

## Tasks

- [x] Reassess issue #60 acceptance criteria against merged work.
- [x] Update contract docs that still describe completed work as pending.
- [x] Verify documentation formatting and record evidence.
- [x] Commit work unit after approval.

## Constraints

- Documentation-only WU.
- Do not add new product scope or implementation.
- Keep auth/access separated in issue #78.
- Keep price/capacity and controlled activity kinds explicitly deferred unless a future issue decides otherwise.

## Evidence

- PR #76 implemented `GET /admin/events/:eventId/foundation`.
- PR #77 connected the frontend route `/admin/events/:eventId/foundation`.
- PR #79 implemented event-window containment.
- Issue #78 tracks minimal admin authentication and access boundary separately.
- Updated `docs/contracts/event-activity-foundation.md` and `docs/contracts/event-activity-api-boundary.md` so event-window containment and the read API/frontend flow are no longer described as pending.
- Verification: initial `corepack pnpm format:check` failed on the edited docs; after Prettier, `corepack pnpm format:check` passed and `git diff --check` passed. Node engine warning persisted: repository wants Node v24.18.1, host uses v24.19.0.
- Work-unit commit: `63e4ada` — `docs(product): update event activity foundation readback`.
