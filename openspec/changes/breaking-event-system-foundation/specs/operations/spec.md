# Operations Specification

## Purpose

Define event-scoped staffing, guest and sponsor coordination, operational assignments, and incident handling.

## Requirements

### Requirement: Operational Roster and Assignments

The system MUST maintain event-scoped records for staff, guests, sponsors, and operational assignments with statuses, responsibilities, and authorized visibility. Assignment changes MUST be traceable and MUST NOT grant access beyond the identity-access assignment.

#### Scenario: Assign an event role

- GIVEN an authorized organizer has an approved staff or guest record for event E
- WHEN the organizer assigns a responsibility and permitted location
- THEN the assignment is visible to authorized operations users for event E
- AND it does not expand the person's protected permissions automatically

#### Scenario: Reject a cross-event assignment

- GIVEN a person or assignment belongs to event A
- WHEN an operator attempts to attach it to event B without an event B record
- THEN the operation is rejected
- AND no cross-event visibility or access is created

### Requirement: Incident Lifecycle

The system MUST support event-scoped incident intake, classification, severity, assignment, status, resolution, and follow-up. Incident access MUST be least-privilege, sensitive details MUST be minimized in general views, and material changes MUST be audited.

#### Scenario: Triage an incident

- GIVEN an authorized operator reports a safety, access, medical, technical, or operational incident for event E
- WHEN a responder classifies, assigns, and resolves it
- THEN the incident history shows each state transition and responsible role
- AND authorized users can retrieve the final resolution

#### Scenario: Restrict sensitive incident details

- GIVEN a user can view operational status but lacks sensitive-incident permission
- WHEN the user requests the incident
- THEN the system shows only the minimum permitted summary
- AND the denied detail access is recorded

### Requirement: Operational Resilience and Experience

Operational workspaces MUST clearly identify event, venue, assignment, incident status, and last-known update. They MUST support responsive layouts, keyboard and assistive-technology operation, and event branding without making urgent states dependent on color alone.

#### Scenario: Work a changing incident queue

- GIVEN the operator uses a narrow viewport or assistive technology
- WHEN a new incident or assignment update is received
- THEN the event and severity are announced or otherwise perceivable
- AND the operator can open and update an authorized item

#### Scenario: Preserve traceability after a failed update

- GIVEN a status update cannot be accepted
- WHEN the operator retries or leaves the incident unchanged
- THEN the system reports the current authoritative status
- AND it does not show an uncommitted update as complete
