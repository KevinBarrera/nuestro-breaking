# Workshops Specification

## Purpose

Define event-scoped workshop sessions, capacity, access, attendance, and participant feedback.

## Requirements

### Requirement: Workshop Session Lifecycle

The system MUST manage event-scoped workshop sessions with instructor, venue, schedule, description, capacity, publication state, and cancellation state. A session MUST NOT be publicly or operationally bookable before required fields are complete.

#### Scenario: Publish a workshop

- GIVEN an authorized organizer has configured a valid session and capacity for event E
- WHEN the session is published
- THEN eligible users can view its schedule and enrollment state
- AND the session remains linked to event E and its venue

#### Scenario: Block incomplete publication

- GIVEN a session has no venue, schedule, or capacity
- WHEN publication is requested
- THEN publication is rejected with the missing requirements
- AND no attendance or booking can be created

### Requirement: Capacity and Enrollment

The system MUST enforce the published capacity for each session and MUST maintain deterministic enrollment statuses. It MUST prevent duplicate enrollment for the same participant and session and MUST not overbook when concurrent requests are processed.

#### Scenario: Enroll within capacity

- GIVEN a participant is eligible and a published session has an available place
- WHEN enrollment is confirmed
- THEN one event-scoped enrollment is created
- AND the remaining capacity is updated authoritatively

#### Scenario: Reject a full session

- GIVEN the session has no available places
- WHEN another participant attempts enrollment
- THEN the system returns a full-session result without overbooking
- AND no duplicate or phantom attendance record is created

### Requirement: Workshop Access and Attendance

Attendance MUST be limited to authorized workshop operators and participants with a valid enrollment or explicitly recorded authorized exception. Check-in MUST be idempotent, event-scoped, and auditable.

#### Scenario: Record attendance

- GIVEN a participant has a confirmed enrollment for session S in event E
- WHEN an authorized operator checks the participant in
- THEN attendance is recorded once for S
- AND the operator can see the current attendance state

#### Scenario: Deny unauthorized attendance

- GIVEN a participant is not enrolled, the session is cancelled, or the operator lacks permission
- WHEN attendance is attempted
- THEN the attempt is rejected with a safe reason
- AND capacity and attendance totals remain unchanged

### Requirement: Feedback and Workshop Experience

The system SHOULD allow an eligible attendee to submit feedback once per session, associate responses with the event and session, and restrict response visibility according to configured privacy. Workshop pages and operator flows MUST be responsive, keyboard-operable, assistive-technology compatible, and compatible with event branding.

#### Scenario: Submit session feedback

- GIVEN an attendee has recorded attendance for session S
- WHEN the attendee submits a valid response
- THEN the response is accepted once and linked to S
- AND authorized organizers can use the configured aggregate or permitted response view

#### Scenario: Reject an ineligible response

- GIVEN a person has not attended or has already submitted feedback for S
- WHEN another response is submitted
- THEN the response is rejected or identified as already completed
- AND no second response is stored
