# Tasks: Breaking Event System Foundation

## Review Workload Forecast

Estimated changed lines: 1,800–2,600
Delivery strategy: ask-on-risk

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`stacked-to-main` is sequencing only, not a PR target. Flow: feature/work-unit → `dev` → `staging` → approved `main`. Use additive migrations; rollback needs compatible code plus tested down-migration/restore.

### Suggested Work Units

| Unit | Goal                   | PR  | Focused command                                     | Runtime harness                                               | Rollback boundary                      |
| ---- | ---------------------- | --- | --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| 1    | Docs #5–#8             | 1   | `pnpm format:check`                                 | N/A—docs                                                      | `docs/`/planning                       |
| 2    | PG16/foundation        | 2   | `pnpm --filter @nuestro-breaking/backend test:e2e`  | Docker/Testcontainers PG16: migration/reset/cleanup/isolation | Compatible migration/down/restore      |
| 3    | Identity/accreditation | 3   | `pnpm --filter @nuestro-breaking/backend test`      | PG16 + Supertest auth/check-in                                | Schema-compatible modules              |
| 4    | Competition/live       | 4   | `pnpm --filter @nuestro-breaking/backend test:e2e`  | One Nest + Socket.IO v4 + PG16 recovery                       | Gateway/competition; no offline/broker |
| 5    | Business               | 5   | `pnpm --filter @nuestro-breaking/backend test:e2e`  | PG16 + Supertest                                              | Compatible modules/migrations          |
| 6    | Frontend               | 6   | `pnpm --filter @nuestro-breaking/frontend test:e2e` | Playwright + backend                                          | Frontend                               |
| 7    | Verification           | 7   | `pnpm verify:setup`                                 | PG16 reset/replay/recovery + Playwright                       | Runbooks                               |

## Phase 1: Docs and Gates

- [ ] 1.1 `docs/adr/0001-operating-country.md`, `docs/legal/mexico-readiness-checklist.md`: track Mexico evidence/status; no legal/compliance claim (issue #5).
- [ ] 1.5 Complete `docs/{security/privacy-threat-model.md,runbooks/{recovery,event-day,support}.md,models/{bounded-contexts,data-lifecycle}.md,contracts/api-event-versioning.md}` (issues #6–#8).
- [ ] 1.6 Reconcile stale “country unnamed” wording in `openspec/changes/breaking-event-system-foundation/specs/`: Mexico is planning country; regulated behavior awaits legal review/policy.

## Phase 2: Harness and Foundation

- [ ] 2.1 RED `apps/backend/test/postgres-harness.e2e-spec.ts`: Testcontainers PG16 startup/migrations/reset/cleanup/isolation.
- [ ] 2.2 GREEN `apps/backend/test/support/postgres-harness.ts`: lifecycle before persistence; Docker/E2E.
- [ ] 2.3 RED `apps/backend/src/modules/event-organization/domain/*.spec.ts`: lifecycle/scope/cross-event/venue/version.
- [ ] 2.4 GREEN `apps/backend/src/modules/event-organization/{api,application,domain,infrastructure}`: schemas/migrations.
- [ ] 2.5 RED `apps/backend/test/audit-outbox.e2e-spec.ts`: durability/redaction/order/degradation.
- [ ] 2.6 GREEN `apps/backend/src/database/{schema,audit,outbox}.ts`: transaction contracts.

## Phase 3: Identity and Accreditation

- [ ] 3.1 RED `apps/backend/src/modules/identity-access/**/*.spec.ts`: roles/denials, Argon2id async, generic errors, no-secret logs, sessions, QR/PIN; actual deployment benchmark before GREEN.
- [ ] 3.2 GREEN `apps/backend/src/modules/identity-access/{api,application,domain,infrastructure}`: username/password and opaque PostgreSQL sessions.
- [ ] 3.3 RED `apps/backend/src/modules/participant-accreditation/**/*.spec.ts`: crew/enrollment/consent/check-in.
- [ ] 3.4 GREEN `apps/backend/src/modules/participant-accreditation/{api,application,domain,infrastructure}`: persistence.

## Phase 4: Competition and Live

- [ ] 4.1 RED `apps/backend/src/modules/competition/**/*.spec.ts`: eligibility/brackets/stale scores/sequencing/recovery.
- [ ] 4.2 GREEN `apps/backend/src/modules/competition/{api,application,domain,infrastructure}`: authoritative commands/projections/snapshots.
- [ ] 4.3 RED `apps/backend/src/modules/competition/api/*.spec.ts`: Socket.IO ordering/duplicates/reconnect/snapshot/connectivity; no offline sync or multi-instance scaling.
- [ ] 4.4 GREEN `apps/backend/src/modules/competition/api/competition.gateway.ts`: single-instance Socket.IO v4 after identity/competition foundations.

## Phase 5: Business Modules

- [ ] 5.1 RED `apps/backend/src/modules/{workshops,operations}/`: capacity/attendance/incidents/least privilege.
- [ ] 5.2 GREEN `apps/backend/src/modules/{workshops,operations}/{api,application,domain,infrastructure}`: persistence.
- [ ] 5.3 RED `apps/backend/src/modules/commerce-finance/`: orders/inventory/over-allocation/reconciliation/regulatory boundary.
- [ ] 5.4 GREEN `apps/backend/src/modules/commerce-finance/{api,application,domain,infrastructure}`: persistence.
- [ ] 5.5 RED `apps/backend/src/modules/communications-reporting/`: notifications/results/exports/delivery failure.
- [ ] 5.6 GREEN `apps/backend/src/modules/communications-reporting/{api,application,domain,infrastructure}`: persistence.

## Phase 6: Frontend FSD

- [ ] 6.1 RED `apps/frontend/tests/*.spec.ts`: context/roles, keyboard/screen-reader status, contrast, check-in, scoring, results.
- [ ] 6.2 GREEN extend `apps/frontend/src/{entities,features,widgets,pages,app,shared}` with context, actions, routes, theme, recovery.

## Phase 7: Verification

- [ ] 7.1 Run `pnpm verify:setup`, focused tests, lint/build/format; verify scenarios; threat matrix N/A.
- [ ] 7.2 Drill migration/reset, outbox replay, snapshot recovery, health, event-day/support; record `verify-report.md`.
