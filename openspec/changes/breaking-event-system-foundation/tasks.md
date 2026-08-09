# Tasks: Breaking Event System Foundation

## Review Workload Forecast

Docs: ≤800 lines under accepted `size:exception`; product: 2,400–3,600 lines.

Docs-only `size:exception`; product needs explicit delivery decision before `sdd-apply`.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Flow: feature/work-unit → `dev` → `staging` → approved `main`. No oversized product PRs; migrations need compatible code + tested down-migration/restore.

### Suggested Work Units

| Unit            | Focused test command                                                                                     | Runtime harness                            | Rollback boundary                |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| Foundation gate | `pnpm --filter @nuestro-breaking/backend test:e2e`                                                       | Docker/Testcontainers PG16 reset/isolation | docs and foundation migrations   |
| Release 1       | `pnpm --filter @nuestro-breaking/backend test` + `pnpm --filter @nuestro-breaking/frontend test:e2e`     | PG16, Supertest, Playwright                | accreditation modules/migrations |
| Release 2       | `pnpm --filter @nuestro-breaking/backend test:e2e` + `pnpm --filter @nuestro-breaking/frontend test:e2e` | one Nest instance, Socket.IO v4, PG16      | competition/gateway              |
| Release 3       | `pnpm --filter @nuestro-breaking/backend test` + `pnpm --filter @nuestro-breaking/frontend test:e2e`     | PG16, Supertest, Playwright                | workshops/operations             |
| Release 4       | `pnpm --filter @nuestro-breaking/backend test:e2e` + `pnpm --filter @nuestro-breaking/frontend test:e2e` | PG16, Supertest, Playwright                | commerce modules/migrations      |

## Phase 1: Foundation Gate (not a user release)

- [ ] 1.1 Track Mexico evidence/status in `docs/adr/0001-operating-country.md` and `docs/legal/mexico-readiness-checklist.md`; no legal/compliance claim (issue #5).
- [ ] 1.2 Complete `docs/{security/privacy-threat-model.md,runbooks/{recovery,event-day,support}.md,models/{bounded-contexts,data-lifecycle}.md,contracts/api-event-versioning.md}` (issues #6–#8).
- [ ] 1.3 Reconcile task 1.6 in `openspec/changes/breaking-event-system-foundation/specs/`: Mexico is planning country; regulated behavior awaits legal/policy review.
- [ ] 1.4 Before design/schema/UI, clarify nickname, duo model/rules, tracks, battle-guest-placement, paid-workshop QR access, translators, travel/hotel, run-of-show, sponsor-deliverables, and pricing phases/bundles/golden-tickets/budget; no delivery claim.
- [ ] 1.5 RED `apps/backend/test/{postgres-harness,audit-outbox}.e2e-spec.ts`: PG16 migrations/reset/cleanup/isolation + scoped audit/outbox durability, redaction, ordering, degradation.
- [ ] 1.6 GREEN `apps/backend/test/support/postgres-harness.ts`, `apps/backend/src/database/{schema,audit,outbox}.ts`, `apps/backend/drizzle/`: tested scope/audit/outbox primitives.

## Phase 2: Release 1 — Accreditation

- [ ] 2.1 RED backend `apps/backend/src/modules/{event-organization,identity-access,participant-accreditation}/**/*.spec.ts`: event/venue, secure sign-in, profile/enrollment/crew, manual/QR staff station; minor/guardian waivers await legal policy.
- [ ] 2.2 RED frontend `apps/frontend/e2e/accreditation.spec.ts`: FSD context, sign-in, enrollment, crew, accessible station, safe status/errors.
- [ ] 2.3 GREEN backend modules under `apps/backend/src/modules/{event-organization,identity-access,participant-accreditation}/`: scoped API, persistence, audit.
- [ ] 2.4 GREEN FSD paths `apps/frontend/src/{entities,features,widgets,pages,app,shared}/`: usable accreditation UX.

## Phase 3: Release 2 — Competition Live

- [ ] 3.1 RED backend `apps/backend/src/modules/competition/**/*.spec.ts` and frontend `apps/frontend/e2e/competition-live.spec.ts`: qualifier/bracket controls, judge rubric scoring, stale/duplicate/recovery states, public results/projection UX.
- [ ] 3.2 GREEN `apps/backend/src/modules/competition/{api,application,domain,infrastructure}/` and `competition.gateway.ts`: server-authoritative, single-instance Socket.IO; no offline/manual replay.
- [ ] 3.3 GREEN competition FSD routes/widgets: accessible live status and snapshot recovery.

## Phase 4: Release 3 — Workshops and Basic Operations

- [ ] 4.1 RED backend/frontend tests: schedules, capacity, enrollment, attendance, feedback, staff roster/assignments/incidents, least-privilege status/error UX.
- [ ] 4.2 GREEN `apps/backend/src/modules/{workshops,operations}/` and matching FSD paths; translators, hospitality, travel/hotel, run-of-show, sponsor deliverables, and sensitive medical records remain unresolved requirements.

## Phase 5: Release 4 — Commerce

- [ ] 5.1 RED backend/frontend tests: catalog, inventory, non-regulated orders/reconciliation, accessible status/error UX.
- [ ] 5.2 GREEN `apps/backend/src/modules/commerce-finance/` and matching FSD paths; pricing phases, bundles, golden tickets, organizer budget, prizes, travel payments, payouts, tax/invoices, and payment policy require clarification/legal gates first.

## Phase 6: Verification

- [ ] 6.1 Run `pnpm verify:setup`, commands, lint/build/format, migration/reset/recovery drills, release scenarios; record no legal/offline/unresolved-domain claims.
