# Data Lifecycle Model

This document classifies planned records by owner and lifecycle. PostgreSQL is the authoritative source of truth; audit and outbox facts record accepted or denied decisions, while public projections expose only deliberately permitted data.

## Scope

- Defines planned data ownership and lifecycle categories for future implementation.
- Establishes the distinction between authoritative state, durable audit/outbox facts, and public projections.
- Does not authorize a schema, retention schedule, migration, implementation, or release.

## Record classes

| Class               | Purpose                                                                                                         | Authority and mutation                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Authoritative state | Current business truth required to validate and execute a command                                               | Owned by one module in PostgreSQL; changed only by an accepted owner command.           |
| Audit fact          | Durable record of a security-sensitive, operational, or business decision, including relevant failure decisions | Append-only and redacted as needed; not an editable substitute for current state.       |
| Outbox fact         | Ordered durable publication intent produced with an accepted transaction                                        | Appended atomically with authoritative change; consumers do not become authoritative.   |
| Public projection   | Deliberately published, read-only view for an audience                                                          | Derived from permitted authoritative facts; may lag and is recoverable from a snapshot. |

Audit and outbox facts are not public projections. A projection is never a command source, and it does not authorize a local change or replay.

## Ownership and lifecycle model

| Area                              | Owning context              | Authoritative lifecycle                                                                                                                                                                                                                                                                 | Audit/outbox facts                                                                                                                                                                                  | Projection boundary                                                                                                                       |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Organization and event            | `event-organization`        | Organization configuration persists across events. An event has stable identity, schedule, venue, publication, operational availability, and closure states. Event-scoped work is unavailable before publication or after closure.                                                      | Publication, closure, rejected lifecycle operations, and material configuration decisions are durable facts.                                                                                        | Event identity and approved presentation settings may be consumed by authorized operational or public views.                              |
| Roles, credentials, and sessions  | `identity-access`           | Roles move through approval, active, suspended, and revoked states with organization/event/venue/station/session scope. QR/PIN credentials have issuance, use policy, expiry, rotation, and revocation. Opaque sessions are server-side and have active, expiry, and revocation states. | Successful and failed authorization, credential, sign-in, session, and sensitive-action decisions record scope, actor/credential reference, time, station/device context, outcome, and safe reason. | No credential, session, secret, or sensitive authorization detail is public.                                                              |
| Enrollment and check-in           | `participant-accreditation` | Profiles, event crew membership, enrollment, waiver/consent status evidence, and check-in status are event-scoped. Enrollment and check-in transitions are idempotent and retain applicable history.                                                                                    | Enrollment decisions, cross-event/duplicate denials, check-in attempts, and final accepted state are durable facts.                                                                                 | Only explicitly permitted participant-facing or operational views are derived; no public projection is implied.                           |
| Competition state and projections | `competition`               | Categories, eligibility, qualifier rules, brackets, matches, rubrics, scores, transitions, and finalized results are event-scoped and versioned. The server sequences accepted changes.                                                                                                 | Accepted/rejected score and bracket commands, version decisions, ordered outbox entries, and publication decisions are durable facts.                                                               | `communications-reporting` may expose only finalized, authorized public result data with event/category/match/status/update-time context. |
| Workshops                         | `workshops`                 | Sessions move through configured, published, cancelled, and completed states. Capacity, enrollment, attendance, and feedback eligibility remain event- and session-scoped.                                                                                                              | Publication, capacity, attendance, cancellation, and safe denial decisions are durable facts.                                                                                                       | Schedule and enrollment-state views are released only as authorized; feedback visibility follows later approved policy.                   |
| Operations                        | `operations`                | Staff/guest/sponsor records, assignments, and incidents have scoped status, responsibility, assignment, resolution, and follow-up histories.                                                                                                                                            | Assignment changes, incident transitions, restricted-detail access, and failed updates are durable facts.                                                                                           | General views use only the minimum permitted summary; sensitive incident details are not public.                                          |
| Commerce records                  | `commerce-finance`          | Catalog items, order lines, fulfillment, payment-reference, reconciliation, inventory balance, and inventory movements are event-scoped. Confirmed movements preserve traceable history and avoid silent overwrite.                                                                     | Order, adjustment, refund-request, inventory, reconciliation, authorization, and conflict decisions are durable facts.                                                                              | No public financial, payment, or settlement projection is defined by this foundation.                                                     |

## Transaction and recovery boundary

For a state-changing command, the owning context plans to commit the authoritative change, required audit fact, and ordered outbox fact in one PostgreSQL transaction. If a required durable audit record cannot be accepted, the sensitive action is not reported as successful.

Projections consume permitted outbox facts as read-only material. On reconnect or a detected gap, a client obtains an authoritative, versioned snapshot before continuing from later updates. The client never promotes a cached projection to authoritative state.

## Deferred policy decisions

Mexico is the planning country only. Legal, regulatory, privacy, tax, payment, waiver, consent, retention, deletion, minor-data, guardian, incident/medical-record, and settlement choices remain explicitly deferred pending legal/policy review. This lifecycle model makes no compliance, retention, or legal-sufficiency assertion.

## Explicitly out of scope

- Database tables, fields, migrations, retention/deletion execution, backup policy, and operational runbooks.
- Multi-organization isolation, offline storage, local synchronization, manual replay, and client-authoritative recovery.
- Notifications and exports, except that later authorized work may define them separately.
- Release authorization or product implementation. The Foundation Gate remains incomplete.

## Cross-references

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
- [ADR 0006: PostgreSQL harness](../adr/0006-postgresql-harness.md)

### Planning basis

- [Proposal](../../openspec/changes/breaking-event-system-foundation/proposal.md)
- [Design](../../openspec/changes/breaking-event-system-foundation/design.md)
