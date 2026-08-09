# ADR 0004: Use a NestJS Gateway with Socket.IO v4 for First-Release Realtime

## Status

Accepted for planning.

## Context

Competition workflows need ordered, recoverable live updates. The design requires server authority, idempotent commands, version checks, and snapshot recovery while keeping transport separate from domain rules.

## Decision

The first release will use a NestJS Gateway with Socket.IO v4 on one backend instance. Connections will use role and event rooms. Client commands will use acknowledgements and remain server-authoritative; the server validates, sequences, and returns the authoritative outcome.

Clients recover from reconnects or projection gaps by fetching a snapshot before resuming live updates. PostgreSQL remains the authoritative system of record.

Broker/adapter integration and multi-instance scaling are deferred. This ADR does not install Socket.IO or any other dependency.

## Consequences

- First-release realtime planning has a concrete transport and a single-instance operational boundary.
- Clients must handle acknowledgement failures, connection state, and snapshot recovery rather than assuming local state is authoritative.
- Scaling beyond one backend instance requires a later decision on broker/adapter topology and operational behavior.

## Non-goals / Follow-ups

- This ADR does not select or configure a broker, adapter, or multi-instance deployment model.
- Define Gateway contracts, authorization boundaries, observability, and recovery drills before implementation.
- This ADR does not replace PostgreSQL with a realtime transport as the system of record.

## Evidence

- `openspec/changes/breaking-event-system-foundation/design.md` requires ordered projections, idempotency, versioning, and snapshot-first reconnect recovery.
- `openspec/changes/breaking-event-system-foundation/tasks.md` schedules live ordering, duplicate, and reconnect tests after the ADR gates.
