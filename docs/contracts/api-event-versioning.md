# API and Event Versioning Contract

This is the planned contract boundary for server-authoritative commands and future realtime projections. REST/OpenAPI is the command contract; a future Socket.IO gateway distributes projections after an accepted authoritative change.

## Scope

- Defines a common envelope and outcome rules for future event-scoped commands and projections.
- Applies especially to live competition and public competition results.
- Does not implement endpoints, OpenAPI documents, Socket.IO, dependencies, authentication, or release authorization.

## Command contract: REST/OpenAPI

Every state-changing REST command MUST include these values in its request contract:

| Field             | Requirement                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `eventId`         | Stable identifier of the event whose scoped state is being changed.                                                               |
| `commandId`       | Client-generated idempotency identifier, unique for the command's intended effect.                                                |
| `expectedVersion` | Version of the target authoritative aggregate or explicit command target observed by the client.                                  |
| `payload`         | Only fields permitted by the command-specific OpenAPI schema. Unknown, cross-event, unauthorized, or invalid fields are rejected. |

The server MUST authenticate and authorize the caller, validate event lifecycle and scope, apply the command through the owning context, and return the authoritative outcome. The command contract does not permit clients to select an event sequence, bypass lifecycle rules, or write a projection directly.

## Outcome and idempotency rules

| Situation                                  | Planned response                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| First acceptable command                   | Apply once, commit authoritative state with required audit/outbox facts, and return resulting version and outcome.                   |
| Same `commandId`, same intent              | Return the original deterministic outcome without applying the effect again.                                                         |
| Same `commandId`, incompatible intent      | Reject as an idempotency conflict; do not choose a new effect.                                                                       |
| Stale `expectedVersion`                    | Return a stale/conflict result with enough current-version context to request the authoritative snapshot; do not silently overwrite. |
| Scope, lifecycle, or authorization failure | Return a safe denial that does not disclose protected cross-event or credential/session data.                                        |
| Required audit durability failure          | Do not report a sensitive command as successful.                                                                                     |

Concrete status codes and command-specific payload schemas remain implementation work. They must be published in the future OpenAPI contract rather than inferred from this planning document.

## Projection contract: future Socket.IO

Socket.IO v4 is a future, module-owned projection transport. It does not accept client-authoritative business decisions and does not replace REST/OpenAPI commands or PostgreSQL authority.

Each emitted projection event MUST provide:

| Field        | Requirement                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| `eventId`    | Explicit event scope for routing and validation.                                |
| `sequence`   | Server-assigned ordered event/projection sequence within the documented stream. |
| `type`       | Versioned, documented projection event type.                                    |
| `occurredAt` | Server-recorded event time.                                                     |
| `payload`    | Only fields permitted by the event-type contract and audience boundary.         |

Projection consumers treat a gap, reconnect, or acknowledgement failure as recovery work, not permission to replay local decisions. They MUST request an authoritative versioned snapshot, replace or reconcile their local projection from that snapshot, and then continue only from a later sequence.

## Publication limits

Release 2 permits only the public competition projection. It may publish authorized, finalized competition results with event, category, match, status, and update-time context. It MUST NOT publish provisional or conflicted results, data from an unpublished or different event, participant data not approved for publication, credentials, sessions, incidents, financial data, audit data, notifications, or exports.

Offline operation and manual replay are not contract fallbacks. A disconnected client blocks or safely fails live action, surfaces its recovery state, and resumes only after snapshot recovery. Local queues, offline storage, conflict reconciliation, and manual replay are explicitly out of scope.

## Explicitly out of scope

- WebSocket command endpoints, broker/adapter topology, multi-instance transport, and concrete Socket.IO room naming.
- Full OpenAPI schemas, HTTP status taxonomy, generated clients, authentication mechanics, and frontend behavior.
- Notifications, exports, and all non-competition public publication.
- Product implementation, release authorization, and any Mexico-specific legal, regulatory, privacy, tax, payment, waiver, retention, or minor-data decision. All remain deferred pending legal/policy review; this contract makes no compliance assertion.

## Cross-references

- [Design](../../openspec/changes/breaking-event-system-foundation/design.md)
- [Competition specification](../../openspec/changes/breaking-event-system-foundation/specs/competition/spec.md)
- [Communications and Reporting specification](../../openspec/changes/breaking-event-system-foundation/specs/communications-reporting/spec.md)
- [ADR 0002: Identity sessions](../adr/0002-identity-session.md)
- [ADR 0003: Credential trust](../adr/0003-credential-trust.md)
- [ADR 0004: Realtime transport](../adr/0004-realtime-transport.md)
- [ADR 0005: No offline policy](../adr/0005-no-offline-policy.md)

## Delivery boundary

This contract is foundation planning evidence only. The Foundation Gate remains incomplete, and no release or product implementation is authorized by this document.
