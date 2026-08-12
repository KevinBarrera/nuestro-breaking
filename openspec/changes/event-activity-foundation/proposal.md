# Proposal: Event Activity Foundation

## Intent

Establish a PostgreSQL 16 contract for multi-day events with reusable venues and simultaneous activities. The merged **DRAFT** November brief evidences the coordination problem but is not approved scope. This foundation supports that reality without claiming to solve the November flow or prove pilot readiness.

## Scope

### In Scope

- Organization as the operating boundary, owning reusable venues and events without user ownership.
- Multi-day event container with an IANA time zone and optional all-or-nothing overall window.
- Event-venue membership and neutral activities with identity, kind, name, venue, and time interval.
- PG16 proof of scope, time validity, membership, two-direction window containment, migration/reset, and permitted overlaps.
- Two stacked-to-main slices below 400 authored lines: container/venue scope, then membership/activity scheduling. Report generated migration metadata separately.

### Out of Scope

- API, UI, seed; identity ownership; auth/session; lifecycle/publication; audit/outbox.
- Roster/check-in; competition categories/stages/scoring; workshops; payments; legal claims; November flow or pilot-readiness claims.

## Capabilities

### New Capabilities

- `event-activity-persistence`: organization, venue, event, event-venue membership, neutral activity, temporal, and scope invariants.

### Modified Capabilities

None; `openspec/specs/` has no baseline capabilities.

This successor supersedes only closed, unmerged PR #32/#33/#36/#37 assumptions: organizer ownership, mandatory event venue/schedule, and bundled API/seed/UI/lifecycle. It does not supersede the broader `breaking-event-system-foundation` SDD change.

## Approach

Add Drizzle schemas and migrations. Scope venues and events to organizations; attach venues through `event_venues`; enforce activity membership with composite keys. Store instants as `timestamptz`, retain the event IANA zone, allow overlaps, and use constraints plus a two-direction constraint trigger for window containment.

## Affected Areas

| Area                                                      | Impact | Description                       |
| --------------------------------------------------------- | ------ | --------------------------------- |
| `apps/backend/src/database/schema/`                       | New    | Persistence definitions           |
| `apps/backend/drizzle/`                                   | New    | Two additive migration slices     |
| `apps/backend/test/event-activity-foundation.e2e-spec.ts` | New    | PG16 invariant proof              |
| `apps/backend/test/support/postgres-harness.ts`           | Reused | Unchanged migration/reset harness |

## Risks

| Risk                                        | Likelihood | Mitigation                                      |
| ------------------------------------------- | ---------- | ----------------------------------------------- |
| Draft rules leak into persistence           | Med        | Keep activities neutral and exclusions explicit |
| Window enforcement misses one mutation path | Med        | PG16-test activity and event updates            |
| Review slices exceed budget                 | Med        | Separate slices and disclose generated lines    |

## Rollback Plan

Revert planning artifacts before apply. If implemented, reverse slice 2 before slice 1 when no dependent data exists; otherwise use a forward corrective migration.

## Dependencies

- Existing Drizzle migration path and PostgreSQL 16 `PostgresHarness`.

## Success Criteria

- [ ] PG16 proves all listed invariants and allows simultaneous activities.
- [ ] Both slices remain below 400 authored changed lines.
- [ ] No excluded behavior or November/pilot claim enters the capability contract.
