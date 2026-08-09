# Participant Accreditation Specification

## Purpose

Define participant profiles, crews, event enrollment, waiver status, and reliable check-in for dancers and other accredited attendees.

## Requirements

### Requirement: Profiles and Crew Membership

The system MUST maintain a participant profile and event-scoped crew membership with clear ownership, status, and history. A participant MAY belong to different crews across events, but a crew membership MUST NOT be silently reused across events.

#### Scenario: Enroll a crew

- GIVEN an authorized organizer or crew representative creates a crew for event E
- WHEN eligible participants accept their memberships
- THEN the crew has a traceable roster for event E
- AND changes preserve prior membership history

#### Scenario: Reject a cross-event roster reference

- GIVEN a roster entry belongs to event A
- WHEN it is submitted for an enrollment in event B
- THEN the enrollment is rejected
- AND the participant's event A data is not exposed in the error

### Requirement: Enrollment and Eligibility

The system MUST manage enrollment through explicit statuses and MUST validate event, category, crew, participant, and required accreditation conditions before confirming participation. Duplicate enrollment for the same participant, event, and permitted category MUST be prevented or resolved deterministically.

#### Scenario: Confirm eligible enrollment

- GIVEN a participant has a valid profile, accepted required conditions, and an open category in event E
- WHEN an authorized enrollment is submitted
- THEN one confirmed enrollment is created for event E
- AND the enrollment is available to check-in and competition workflows

#### Scenario: Reject duplicate or closed enrollment

- GIVEN the participant is already confirmed or the category is closed
- WHEN another enrollment is submitted
- THEN no second enrollment is created
- AND the requester receives a testable status explaining the rejection

### Requirement: Waiver and Consent Status

The system MUST track the waiver or consent document version, participant decision, timestamp, and event scope. Mexico is the planning country; legal sufficiency, guardian/minor-data handling, retention, and jurisdiction-specific wording are **blocked/deferred** pending legal/policy review. The system MUST NOT infer or claim those rules.

#### Scenario: Record an accepted version

- GIVEN event E requires a published waiver version
- WHEN the participant accepts that version
- THEN the acceptance status and version are linked to the participant and event
- AND check-in may use that status only as configured operational evidence

#### Scenario: Block an unresolved legal policy

- GIVEN a workflow requires a Mexico-specific waiver, guardian, or retention decision before legal/policy approval
- WHEN an organizer attempts to activate that policy
- THEN activation is blocked and marked pending legal/policy decision
- AND no claim of legal compliance is presented

### Requirement: Check-In State and Experience

Check-in MUST be event-scoped, idempotent, auditable, and restricted to authorized accreditation staff. The responsive check-in experience MUST support scanner and manual flows, keyboard operation, and assistive technology without exposing unnecessary participant data.

#### Scenario: Check in an enrolled participant

- GIVEN an authorized operator presents a valid credential or locates an eligible enrollment for event E
- WHEN check-in is confirmed
- THEN the enrollment becomes checked in once
- AND the operator sees only the information needed for accreditation

#### Scenario: Retry a completed or ineligible check-in

- GIVEN an enrollment is already checked in or lacks a required operational condition
- WHEN the operator retries check-in
- THEN the system returns the current state without duplicating attendance
- AND the attempt is auditable
