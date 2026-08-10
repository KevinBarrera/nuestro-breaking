# Planned Recovery Runbook

This is planning guidance for a future connectivity-only event system. It does
not establish an implemented recovery procedure, backup capability, service
level, or production readiness.

## Prerequisites

Before this runbook can be used operationally, future implementation must
provide an authorized operator, event scope, connection-state indication, and
an authoritative versioned snapshot path. PostgreSQL is planned as the
authoritative source of state; projections and browser state are not authority.

The planned persistence test posture uses disposable PostgreSQL 16 through
Testcontainers with real migrations, reset, cleanup, and isolation. That is a
future test/recovery posture, not an implemented production restore procedure.

## Expected operator actions

1. On a disconnect, acknowledgement failure, or detected projection gap, stop
   entering live decisions for the affected event.
2. Preserve only the minimum safe context: event, authorized role, time,
   visible connection/recovery state, and non-sensitive error reference.
3. Restore connectivity through the future approved environment path; do not
   queue, reconstruct, or submit local decisions.
4. After future authorization succeeds, request the authoritative versioned
   snapshot, replace or reconcile the local projection, and resume only from a
   later confirmed sequence.
5. If a snapshot cannot be obtained or its event/version is unclear, keep the
   workflow stopped and escalate. Do not represent a local view as current.

## Safe stop conditions

- The client is disconnected, a command acknowledgement fails, or a sequence
  gap is detected.
- The current event scope, role, snapshot version, or authoritative status
  cannot be confirmed.
- A required audit record or durable authoritative outcome is unavailable.

Offline operation and manual event replay are not supported fallbacks. A
disconnected workflow must remain blocked or safely fail until snapshot
recovery completes.

## Escalation and ownership gaps

Future event operations, engineering/operations, security, and data-recovery
owners must define contacts, authority boundaries, recovery drills, incident
handling, and publication decisions before activation. No on-call model,
monitoring, alert threshold, recovery time, recovery point, or service level is
defined by this document.

Escalate a missing snapshot, uncertain authority, suspected cross-event data,
or sensitive-data exposure to the future designated owner. Until that owner is
assigned, stop the affected workflow rather than improvising recovery.

## Explicitly unavailable procedures

The following implementation-dependent procedures do not yet exist and must
not be inferred from this runbook:

- PostgreSQL backup, restore, failover, or point-in-time recovery steps.
- Snapshot endpoint, authentication, version-conflict, or transport commands.
- Dashboard, alert, audit-review, credential-revocation, or incident-ticket
  workflows.
- Production migration rollback, data repair, broker/adapter, or
  multi-instance recovery procedures.

## Planning references

- [API and Event Versioning Contract](../contracts/api-event-versioning.md)
- [Data Lifecycle Model](../models/data-lifecycle.md)
- [Privacy and Security Threat Model](../security/privacy-threat-model.md)
- [ADR 0004: Realtime transport](../adr/0004-realtime-transport.md)
- [ADR 0005: Connectivity-only policy](../adr/0005-no-offline-policy.md)
- [ADR 0006: PostgreSQL harness](../adr/0006-postgresql-harness.md)
