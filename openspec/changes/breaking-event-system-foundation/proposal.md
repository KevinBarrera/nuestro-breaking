# Proposal: Breaking Event System Foundation

## Intent

Define a planning-only delivery boundary: a short non-user foundation gate followed by four separately authorized vertical releases. It authorizes neither current implementation nor all-backend-first sequencing.

## Scope

### In Scope

- Foundation: Mexico planning evidence, unresolved-domain clarification, planning/runbook artifacts, and audit/outbox foundations.
- Full-stack releases: 1 Accreditation (organization/event schema and accessible event shell); 2 Competition Live (public competition projection); 3 Workshops and Basic Operations; 4 non-regulated Commerce.
- One organization operates multiple events; all operational entities are event-scoped and every user-facing release includes frontend UX, protected persistence, audit, and recovery.

### Out of Scope

- Implementation, dependencies, configuration, offline/manual mode, and multi-organization isolation.
- Release 2 notifications/exports and all Mexico-regulated behavior, pending legal/policy review.

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

Future implementation uses a modular monolith with module-owned persistence and FSD. Mexico is the planning country; regulated behavior is blocked pending legal/policy review. PostgreSQL is authoritative; live flows use Socket.IO v4, Testcontainers PostgreSQL 16, and Argon2id sessions, with parameter benchmarking and multi-instance scaling deferred.

## Affected Areas

| Area                 | Impact                          |
| -------------------- | ------------------------------- |
| `openspec/`, `docs/` | Planning artifacts              |
| `apps/*/src/`        | Future authorized releases only |

## Risks and Blockers

| Risk / blocker      | Mitigation                                            |
| ------------------- | ----------------------------------------------------- |
| Bearer credentials  | Least privilege, expiry/revocation, throttling, audit |
| Mexico legal review | Block regulated behavior                              |
| Live contention     | Connectivity, versions, monitoring, recovery          |

## Required Decisions and Documents

- ADRs: Mexico status, sessions, credentials, transport, no-offline policy, and test harness.
- Documents: bounded contexts, lifecycle, contracts, threat/privacy, accessibility, tests, and runbooks.

## Rollback Plan

Delete or supersede this proposal and future deltas; no product/schema rollback is required.

## Dependencies

- Complete required legal review for Mexico before regulated-domain specifications proceed.

## Success Criteria

- [ ] The foundation gate and four vertical releases have unambiguous ownership and sequence.
- [ ] Release 1 retains organization/event schema and the accessible event shell; Release 2 owns public competition projection only.
- [ ] Regulated behavior, notifications, and exports remain blocked or deferred until separately authorized.
