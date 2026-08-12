# Proposal: Event Activity Foundation

## Intent

Establish a PostgreSQL 16 contract for multi-day events with reusable venues and simultaneous neutral activities. The merged **DRAFT** November brief evidences a coordination problem, not approved scope or pilot readiness.

## Scope

### In Scope

- Organization-owned reusable venues and events, without user ownership.
- Multi-day event containers with an IANA zone and optional all-or-nothing window.
- Membership and neutral activities with identity, kind, name, venue, and interval.
- PG16 proof of scope, time validity, containment, reset/replay, and permitted overlap.
- Three work units, each below 400 authored changed lines: completed WU1/`0001`, declarative WU2-A/`0002`, and deferred enforcement WU2-B/`0003`. Generated metadata is reported separately.

### Out of Scope

- API, UI, seed, identity/auth, lifecycle, audit/outbox, roster/check-in, competition, workshops, payments, legal claims, November flow, and pilot-readiness claims.

## Capability

- `event-activity-persistence`: organization, venue, event, membership, neutral activity, temporal, and scope invariants.

This supersedes only closed, unmerged PR #32/#33/#36/#37 assumptions about organizer ownership, mandatory scheduling, and bundled API/seed/UI/lifecycle. It does not supersede `breaking-event-system-foundation`.

## Approach

Drizzle defines schemas and declarative migrations. `0001_event_containers.sql` is WU1, `0002_event_activity_membership.sql` adds membership/activity constraints, and migration-authoritative `0003_event_activity_windows.sql` adds deferred containment triggers. Instants use `timestamptz`; events retain their IANA authoring/display zone; overlaps remain permitted.

## Delivery

Machine `chain_strategy` remains `stacked-to-main`, the accepted canonical domain value; it does not state a PR target. The repository's immediate integration target is `dev`: WU1 is complete on `dev`, WU2-A's PR targets `dev`, and WU2-B initially targets the WU2-A branch then rebases/retargets to `dev`. Staging/main promotion is excluded.

## Affected Areas

| Area                                                      | Impact                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| `apps/backend/src/database/schema/`                       | WU2-A tables and exports                     |
| `apps/backend/drizzle/{0002,0003}_*.sql`                  | Declarative then deferred migrations         |
| `apps/backend/drizzle/meta/`                              | Generated history for declarative migrations |
| `apps/backend/test/event-activity-foundation.e2e-spec.ts` | PG16 invariant and concurrency proof         |

## Risks and Rollback

Window enforcement can miss mutation paths; direct-SQL final-state and concurrent tests mitigate that risk. On an empty undeployed stack, roll back WU2-B → WU2-A → WU1 (`0003`, then `0002`, then `0001` and dependent schemas/metadata). Deployed or populated environments require forward corrective migrations.

## Success Criteria

- [ ] PG16 proves specified invariants and permitted overlaps.
- [ ] WU1, WU2-A, and WU2-B each remain below 400 authored lines.
- [ ] No excluded behavior or November/pilot claim enters the capability.
