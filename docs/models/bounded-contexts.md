# Bounded Contexts and Ownership

This planning model assigns business ownership inside one NestJS modular monolith. It preserves a single PostgreSQL system of record while preventing the database from becoming a shared, cross-module implementation surface.

## Scope

- Defines planned backend ownership, event scope, and allowed module collaboration.
- Applies to future authorized releases; it does not create modules, schemas, repositories, APIs, or release authorization.
- Uses one organization operating multiple events. Operational records belong to one event unless explicitly organization-level configuration.

## Boundary rules

| Rule            | Planned constraint                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Module boundary | Each business module owns its application use cases, domain rules, persistence mapping, and tables.                                         |
| Event scope     | Commands and records carry explicit event scope; missing, mismatched, or cross-event references are rejected.                               |
| Writes          | A module MUST NOT write another module's tables. Cross-context changes use the owning module's application contract.                        |
| Repositories    | Modules MUST NOT share repositories or expose a generic database repository as a business integration API.                                  |
| Reads           | Read models may combine explicitly exposed contracts or projections, but they do not grant write ownership.                                 |
| Platform        | `platform/` remains technical infrastructure (database, configuration, health, API conventions, and observability), not a business context. |
| Shared packages | `packages/shared` remains unused until two consumers require a versioned contract; it is not a shortcut around module ownership.            |

PostgreSQL is authoritative for persisted business state. A database transaction may persist an owning aggregate change with its audit and outbox facts, but it does not permit direct writes into a different business module.

## Context map

| Context                     | Owns                                                                                                          | Collaborates through                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `event-organization`        | Organization configuration, events, venues, event lifecycle, and event presentation configuration             | Event identity and lifecycle contracts consumed by every event-scoped context                |
| `identity-access`           | Identities, scoped roles, opaque sessions, QR/PIN credential lifecycle, authorization decisions               | Scoped authorization contract and audit requirements                                         |
| `participant-accreditation` | Participant profiles, event crews, enrollments, waiver-status evidence, and check-in                          | Event scope, authorized operators, competition eligibility, and credential/session decisions |
| `competition`               | Categories, qualifier rules, brackets, rubrics, scores, authoritative results, and competition recovery state | Enrollment eligibility, role authorization, and public-result publication inputs             |
| `workshops`                 | Sessions, capacity, workshop enrollment, attendance, and feedback                                             | Event/venue identity, authorized operators, and participant eligibility                      |
| `operations`                | Staff and guest operational records, assignments, sponsors, and incidents                                     | Scoped access decisions and event/venue identity                                             |
| `commerce-finance`          | Catalogs, orders, inventory movements, payment references, and reconciliation states                          | Event scope, authorized finance access, and inventory/order contracts                        |
| `communications-reporting`  | Public competition projection and later authorized communications/reporting concerns                          | Explicit, authorized outputs from owning contexts; it does not own competition truth         |

## Collaboration boundaries

1. `event-organization` publishes the event identity and lifecycle that make later operational actions eligible.
2. `identity-access` evaluates active, scoped authority for protected commands; business modules do not recreate role or credential rules.
3. `participant-accreditation`, `competition`, `workshops`, `operations`, and `commerce-finance` each retain their own event-scoped state and validation.
4. `communications-reporting` receives only permitted authoritative outputs. In Release 2, this is limited to public competition projection from finalized state.
5. Cross-context workflows are coordinated by application contracts and explicit facts, not foreign table writes, shared repositories, or hidden transactional coupling.

## Explicitly out of scope

- Microservices, distributed ownership, cross-organization isolation, and a shared database access layer.
- Product implementation, dependencies, migrations, public APIs, and release rollout.
- Offline or manual-replay workflows.
- Mexico-specific legal, regulatory, privacy, waiver, retention, payment, tax, minor-data, or other policy rules. These remain deferred pending legal/policy review; this document makes no compliance assertion.

## Cross-references

### Planning basis

- [Proposal](../../openspec/changes/breaking-event-system-foundation/proposal.md)
- [Design](../../openspec/changes/breaking-event-system-foundation/design.md)
- [Exploration](../../openspec/changes/breaking-event-system-foundation/exploration.md)

### Capability specifications

- [Event Organization](../../openspec/changes/breaking-event-system-foundation/specs/event-organization/spec.md)
- [Identity and Access](../../openspec/changes/breaking-event-system-foundation/specs/identity-access/spec.md)
- [Participant Accreditation](../../openspec/changes/breaking-event-system-foundation/specs/participant-accreditation/spec.md)
- [Competition](../../openspec/changes/breaking-event-system-foundation/specs/competition/spec.md)
- [Workshops](../../openspec/changes/breaking-event-system-foundation/specs/workshops/spec.md)
- [Operations](../../openspec/changes/breaking-event-system-foundation/specs/operations/spec.md)
- [Commerce and Finance](../../openspec/changes/breaking-event-system-foundation/specs/commerce-finance/spec.md)
- [Communications and Reporting](../../openspec/changes/breaking-event-system-foundation/specs/communications-reporting/spec.md)

### Architecture decisions

- [ADR 0001: Operating country](../adr/0001-operating-country.md)
- [ADR 0002: Identity sessions](../adr/0002-identity-session.md)
- [ADR 0003: Credential trust](../adr/0003-credential-trust.md)
- [ADR 0004: Realtime transport](../adr/0004-realtime-transport.md)
- [ADR 0005: No offline policy](../adr/0005-no-offline-policy.md)

## Delivery boundary

These boundaries are foundation planning evidence only. The Foundation Gate remains incomplete, and each user-facing release remains a separately authorized vertical slice.
