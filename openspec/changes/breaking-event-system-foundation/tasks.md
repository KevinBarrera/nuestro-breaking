# Tasks: Breaking Event System Foundation

## Review Workload Forecast

Estimated changed lines: 1,800–2,600
Suggested split: P1 ADRs; P2 foundation; P3 identity; P4 live; P5 business; P6 frontend
Delivery strategy: `dev` integration

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy (canonical sequencing value): stacked-to-main
400-line budget risk: High

### Suggested Work Units

Each future feature/work-unit branch is based on and targets `dev`. Reviewed work merges into `dev` in unit order (PR 1 through PR 6), with no direct feature-to-`main` integration. Promotion proceeds from `dev` to `staging` for QA; an approved production release then reaches `main`. No branches or PRs have been created.

| Unit | Goal             | Likely PR | Focused test command                                | Runtime harness                 | Rollback boundary    |
| ---- | ---------------- | --------- | --------------------------------------------------- | ------------------------------- | -------------------- |
| 1    | ADR gates        | PR 1      | `pnpm format:check`                                 | N/A—docs                        | Revert `docs/`       |
| 2    | Foundation       | PR 2      | `pnpm --filter @nuestro-breaking/backend test`      | A/B isolation                   | Revert foundation    |
| 3    | Identity/access  | PR 3      | `pnpm --filter @nuestro-breaking/backend test`      | Credential/check-in             | Revert two modules   |
| 4    | Competition/live | PR 4      | `pnpm --filter @nuestro-breaking/backend test:e2e`  | Duplicate/stale/reconnect       | Revert adapter       |
| 5    | Business modules | PR 5      | `pnpm --filter @nuestro-breaking/backend test:e2e`  | Incident/capacity/stock/results | Revert modules       |
| 6    | FSD/verification | PR 6      | `pnpm --filter @nuestro-breaking/frontend test:e2e` | Keyboard/theme/recovery         | Revert frontend/docs |

## Phase 1: Approved ADR and Review Gates

- [ ] 1.1 `docs/adr/0001-operating-country.md`: complete the Mexico legal-review gate before waiver, minor-data, retention, tax, payout, invoice, or settlement work; make no legal claim.
- [ ] 1.2 `docs/adr/0002-identity-session.md`, `docs/adr/0003-credential-trust.md`: RED/GREEN-test Argon2id hash/async verify, generic login failure, rate limits, no-secret logging, and rehash upgrades; username/password authentication; opaque PostgreSQL session expiry and immediate revocation; `HttpOnly`, `Secure`, `SameSite` cookies; HTTPS, CSRF/origin protections, audit; QR/PIN scope, expiry, revocation, throttling, and station controls. Benchmark Argon2id parameters on the actual deployment.
- [ ] 1.3 `docs/adr/0004-realtime-transport.md`, `docs/adr/0005-no-offline-policy.md`: RED-test Socket.IO Gateway ordering, duplicates, reconnect and snapshot recovery, connectivity-only behavior; defer multi-instance broker/adapter scaling.
- [ ] 1.4 `docs/adr/0006-postgresql-harness.md`: implement Testcontainers Node with ephemeral PostgreSQL 16, real migrations, reset, cleanup, and isolation before persistence tests.
- [ ] 1.5 `docs/security/privacy-threat-model.md`, `docs/runbooks/{recovery,event-day,support}.md`, `docs/models/{bounded-contexts,data-lifecycle}.md`, `docs/contracts/api-event-versioning.md`.

## Phase 2: Foundation, Scope, Audit, and Outbox

- [ ] 2.1 `apps/backend/src/modules/event-organization/domain/*.spec.ts`: RED-test lifecycle, scope, cross-event rejection, venue/branding, references, versions.
- [ ] 2.2 GREEN: create `apps/backend/src/modules/event-organization/{api,application,domain,infrastructure}` and `apps/backend/src/database/schema/{organizations,events,venues,brands}.ts`, `index.ts`, migrations.
- [ ] 2.3 `apps/backend/src/database/*.spec.ts`: RED-test audit/outbox durability, redaction, ordering, audit-degradation failure.
- [ ] 2.4 GREEN: add `apps/backend/src/database/schema/{audit,outbox}.ts` and transaction contracts.

## Phase 3: Identity, Access, and Accreditation

- [ ] 3.1 `apps/backend/src/modules/identity-access/**/*.spec.ts`: RED-test role lifecycle, denials, QR/PIN expiry/revocation/rate limits, immutable audit.
- [ ] 3.2 GREEN: create `apps/backend/src/modules/identity-access/{api,application,domain,infrastructure}` adapters.
- [ ] 3.3 `apps/backend/src/modules/participant-accreditation/**/*.spec.ts`: RED-test crew history, enrollment deduplication, blocked consent, least-data check-in.
- [ ] 3.4 GREEN: create `apps/backend/src/modules/participant-accreditation/{api,application,domain,infrastructure}` persistence.

## Phase 4: Competition and Live Workflows

- [ ] 4.1 `apps/backend/src/modules/competition/**/*.spec.ts`: RED-test eligibility, brackets, stale versions, scores, sequencing, snapshot recovery.
- [ ] 4.2 GREEN: create `apps/backend/src/modules/competition/{api,application,domain,infrastructure}` with commands, projection, transport.

## Phase 5: Workshops, Operations, Commerce, and Reporting

- [ ] 5.1 RED `apps/backend/src/modules/{workshops,operations}/**/*.spec.ts`: test capacity, attendance, incidents, least privilege.
- [ ] 5.2 GREEN: create `apps/backend/src/modules/workshops/{api,application,domain,infrastructure}` and `apps/backend/src/modules/operations/{api,application,domain,infrastructure}`.
- [ ] 5.3 RED `apps/backend/src/modules/commerce-finance/**/*.spec.ts`: test orders, inventory, over-allocation, reconciliation, regulated boundary.
- [ ] 5.4 GREEN: create `apps/backend/src/modules/commerce-finance/{api,application,domain,infrastructure}`.
- [ ] 5.5 RED `apps/backend/src/modules/communications-reporting/**/*.spec.ts`: test notifications, finalized results, redacted exports, delivery failure.
- [ ] 5.6 GREEN: create `apps/backend/src/modules/communications-reporting/{api,application,domain,infrastructure}`.

## Phase 6: Frontend FSD, Theme, and Accessibility

- [ ] 6.1 `apps/frontend/tests/*.spec.ts`: RED-test event context, roles, responsive keyboard/screen-reader status, contrast, check-in, scoring, public results.
- [ ] 6.2 GREEN: extend `apps/frontend/src/{entities,features,widgets,pages,app,shared}` with context, actions, workspaces, routes, theme tokens, recovery.

## Phase 7: Verification and Runbooks

- [ ] 7.1 Run unit/E2E, lint, builds, format; verify scenarios; threat-matrix N/A.
- [ ] 7.2 Drill PostgreSQL reset/migration, outbox replay, snapshot recovery, health, event-day/support; record `verify-report.md`.
