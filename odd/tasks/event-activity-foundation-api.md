# Event activity foundation API

## Tracking

- GitHub issue: #60 — Define event and activity foundation
- Branch: `feat/60-event-activity-foundation-api`

## Goal

Implement the first read-only backend API slice for the event/activity foundation without adding registration, payments, check-in, authorization internals, scoring, or pilot-readiness semantics.

## Recommended backend structure

Use feature modules at the application boundary and keep shared infrastructure isolated:

```text
apps/backend/src/
  app.module.ts
  database/                 # shared infrastructure: Drizzle client and schema only
  events/                   # event/activity feature boundary
    events.module.ts
    foundation/
      event-foundation.controller.ts
      event-foundation.service.ts
      event-foundation.types.ts
```

Rationale: this keeps NestJS modules aligned with product/domain capabilities, avoids a future flat `controllers/ services/ repositories/` split, and lets later modules such as registration, payments, check-in, and competition grow beside `events/` without coupling their workflows to the persistence layer.

## Tasks

- [x] Explore current backend structure and documented API contract.
- [x] Add a read-only `GET /admin/events/:eventId/foundation` backend slice.
- [x] Verify the focused backend behavior with tests.
- [x] Record final evidence and commit identity.

## Constraints

- Keep the endpoint read-only.
- Do not implement authentication mechanics in this slice; preserve the safe not-found/denied boundary shape where possible.
- Do not add registration, payment, check-in, authorization internals, scoring, publication, or pilot-readiness fields.
- Match `docs/contracts/event-activity-api-boundary.md`.
- Keep database schema migrations out of this slice unless implementation proves a contract gap.

## Evidence

- Initial exploration: backend currently has `AppModule`, `AppController`, `DatabaseModule`, Drizzle schema under `src/database/schema`, and e2e database coverage for the event/activity foundation. The documented planned endpoint is `GET /admin/events/:eventId/foundation`.
- Endpoint e2e RED: existing event requests returned 404 before implementation; GREEN: 2 focused tests passed against migrated PostgreSQL.
- Full e2e: 4 suites / 18 tests passed; unit: 2 suites / 2 tests passed; lint and no-emit TypeScript check passed. The requested pnpm `test:e2e -- --runInBand` and `test -- --runInBand` forms forwarded `--runInBand` as a Jest pattern and found no tests; equivalent direct Jest commands passed.
- Final verification after formatting: `corepack pnpm --filter @nuestro-breaking/backend exec jest --config ./test/jest-e2e.json --runInBand` passed (4 suites / 18 tests); `corepack pnpm --filter @nuestro-breaking/backend exec jest --runInBand` passed (2 suites / 2 tests); `corepack pnpm --filter @nuestro-breaking/backend lint` passed; `corepack pnpm format:check` passed; `git diff --check` passed; `corepack pnpm --filter @nuestro-breaking/backend build` passed. Build generated only Git-ignored `apps/backend/dist/`. Node engine warning persisted: repository wants Node v24.18.1, host uses v24.19.0.
- Work-unit commit: `410ceb2` — `feat(backend): expose event activity foundation endpoint`.
