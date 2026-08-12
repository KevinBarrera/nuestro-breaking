# Event Activity Persistence Specification

## Purpose

Define the PostgreSQL 16 persistence contract for organization-scoped events, reusable venues, and simultaneous neutral activities.

## Requirements

### Requirement: Organization Scope and Reusable Venues

Every event and venue MUST belong to one organization and MUST NOT have user ownership. A venue MAY attach to multiple events in that organization.

#### Scenario: Reuse an organization venue

- GIVEN one organization, one venue, and two events
- WHEN both events attach that venue
- THEN both attachments succeed

#### Scenario: Reject user ownership

- GIVEN an event or venue write
- WHEN user ownership is requested
- THEN no such relationship is accepted

### Requirement: Event Time Zone and Optional Window

An event MUST retain an IANA authoring/display time zone. Its window MAY be absent; otherwise both endpoints MUST exist and start MUST precede end.

#### Scenario: Create an unbounded multi-day event

- GIVEN an organization and valid IANA zone
- WHEN an event omits both window boundaries
- THEN it is accepted unbounded

#### Scenario: Reject incomplete or invalid windows

- GIVEN one missing boundary or start not before end
- WHEN the event is written
- THEN PostgreSQL 16 rejects it

### Requirement: Event-Venue Membership and Scope

An event MUST attach only its organization's venues; PostgreSQL 16 MUST reject cross-organization membership.

#### Scenario: Reject cross-scope venue attachment

- GIVEN differently scoped event and venue
- WHEN they are attached
- THEN PostgreSQL 16 rejects them

### Requirement: Neutral Activities and Valid Intervals

An activity MUST persist identity, kind, name, event, attached venue, and ordered start/end instants as PostgreSQL `timestamptz`. Equivalent explicit offsets MUST normalize to one instant. PostgreSQL MUST NOT claim lexical qualification; coercion discards syntax, and any required validation belongs to a future API. Activities MUST NOT encode competition, workshop, or other product semantics.

#### Scenario: Persist an activity at an attached venue

- GIVEN an attached venue and valid interval
- WHEN a named, typed activity is created
- THEN PostgreSQL 16 accepts it

#### Scenario: Normalize equivalent explicit offsets

- GIVEN equivalent explicit-offset instants
- WHEN persisted for activities
- THEN PostgreSQL 16 compares them equally
- AND retains the event IANA authoring/display zone

#### Scenario: Reject invalid activity placement or interval

- GIVEN an unattached venue or unordered interval
- WHEN an activity is written
- THEN PostgreSQL 16 rejects it

### Requirement: Two-Direction Event Window Containment

Every activity MUST fit a present event window. PostgreSQL 16 MUST enforce this when activities or event windows change.

#### Scenario: Reject an activity outside the event window

- GIVEN a bounded event
- WHEN an activity crosses either boundary
- THEN PostgreSQL 16 rejects it

#### Scenario: Reject narrowing an event around existing activity

- GIVEN an event containing an activity
- WHEN its window excludes that activity
- THEN PostgreSQL 16 rejects the change

### Requirement: Simultaneous Activities

Activities for one event venue MUST allow overlapping intervals.

#### Scenario: Persist overlapping activities

- GIVEN two activities at one event venue
- WHEN they overlap
- THEN PostgreSQL 16 accepts both

### Requirement: Migration, Reset, and Explicit Exclusions

The PostgreSQL 16 migration path MUST apply after reset and preserve these invariants against direct writes. It MUST NOT claim API, UI, seed, identity/auth, lifecycle, audit/outbox, roster, scoring, payment, legal, November-flow, or pilot-readiness behavior.

#### Scenario: Prove resettable persistence boundaries

- GIVEN a reset PostgreSQL 16 database
- WHEN migrations and checks run
- THEN the schema initializes without excluded behavior
