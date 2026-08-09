# ADR 0005: First Release Requires Connectivity

## Status

Accepted for planning.

## Context

Live competition decisions require a single server authority, ordered updates, and recoverable projections. Offline operation would introduce conflicting local state and replay behavior.

## Decision

Connectivity is required for first-release event operations. Version 1 has no offline flow and no manual-replay flow.

The user experience MUST surface connection status and recovery state so operators understand when live actions are unavailable and when snapshot recovery is in progress or complete.

## Consequences

- Event-day planning must include connectivity monitoring and recovery procedures.
- Client workflows must block or safely fail live actions while disconnected instead of queuing them for later replay.
- Snapshot recovery is the approved path to restore client state after interruption.

## Non-goals / Follow-ups

- This ADR does not define offline storage, local synchronization, conflict resolution, or manual replay.
- Define connection-state UX, recovery messaging, and event-day runbook procedures before implementation.

## Evidence

- `openspec/changes/breaking-event-system-foundation/proposal.md` scopes out offline/manual event-day mode.
- `openspec/changes/breaking-event-system-foundation/design.md` specifies connectivity-only acceptance and snapshot recovery.
