# Proposal: Breaking Event System Foundation

## Intent

Define a foundation for one organization to operate multiple breaking events over time: reliable, traceable event-day operations, competition decisions, and public results. This change is planning-only.

## Scope

### In Scope

- One organization and multiple events; operational entities MUST be event-scoped. Multi-organization tenancy is out of scope.
- Integrated operations contract: access, event setup, accreditation, commerce, operations, competition, workshops, and reporting—delivered in risk-based slices.
- Data ownership, audit, connectivity, observability, security/privacy, testing, and recovery foundations.

### Out of Scope

- Product implementation, dependency installation, configuration, offline/manual event-day mode, and multi-organization isolation.
- Country-specific regulations, payouts, taxes, and waivers until required legal review for Mexico is complete.

## Capabilities

### New Capabilities

- `event-organization`: events, venues, branding, mandatory event scope.
- `identity-access`: roles, QR/PIN credentials, revocation, audit.
- `participant-accreditation`: profiles, crews, enrollment, waivers, check-in.
- `commerce-finance`: catalog, orders, inventory, settlement boundaries.
- `operations`: staff, guests, sponsors, incidents.
- `competition`: categories, brackets, scores, authoritative results.
- `workshops`: sessions, capacity, attendance, surveys.
- `communications-reporting`: notifications, public results, exports.

### Modified Capabilities

None; `openspec/specs/` has no baseline capabilities.

## Approach

Use a modular monolith: one deployment/database, bounded modules, narrow public APIs, and module-owned persistence. Preserve FSD; extract shared contracts only after reuse. Mexico is the initial operating country, subject to required legal review. Live flows require connectivity and use Socket.IO v4 through a NestJS Gateway; PostgreSQL remains authoritative. Testcontainers Node with ephemeral PostgreSQL 16 is the approved integration/E2E harness. Password storage uses Argon2id via `node-argon2`; parameter benchmarking on the actual deployment and multi-instance realtime scaling remain follow-ups.

## Affected Areas

| Area              | Impact  | Description                                |
| ----------------- | ------- | ------------------------------------------ |
| `openspec/specs/` | New     | Capability specifications and scenarios.   |
| `docs/`           | New     | ADRs, models, threat/privacy, runbooks.    |
| `apps/*/src/`     | Planned | Future modules/workspaces; no changes now. |

## Risks and Blockers

| Risk / blocker                                | Mitigation                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| QR/PIN bearer credentials can be transferred. | Least privilege, expiry, revocation, throttling, station/session controls, immutable audit, and recorded residual risk. |
| Mexico legal review remains pending.          | Block country-specific payouts, tax, waiver, minor-data, and retention rules.                                           |
| Live failure or score contention.             | Connectivity-only acceptance, idempotency/versioning, monitoring, recovery drills.                                      |

## Required Decisions and Documents

- ADRs: Mexico operating country, username/password with Argon2id and opaque PostgreSQL sessions, credential trust, Socket.IO real-time transport, no-offline policy, and Testcontainers PostgreSQL 16 harness.
- Documents: bounded-context and data/lifecycle models; API/event versioning; threat/privacy, accessibility/branding, test, event-day, support, and recovery plans.

## Rollback Plan

Delete or supersede this proposal and future deltas; no product/schema rollback is required.

## Dependencies

- Complete required legal review for Mexico before regulated-domain specifications proceed.

## Success Criteria

- [ ] Specs can be created from the eight capability contracts with mandatory event scope.
- [ ] ADRs and operations documents resolve foundations and blockers before apply.
- [ ] Implementation remains staged and asks before any 400-line review-budget risk.
