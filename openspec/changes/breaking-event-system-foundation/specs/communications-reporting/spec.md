# Communications and Reporting Specification

## Purpose

Define event-scoped notifications, controlled public results, and authorized exports that remain traceable and accessible.

## Requirements

### Requirement: Event-Scoped Notifications

The system MUST create notifications from event-scoped business events, address them only to eligible recipients, and record delivery state, timestamps, and failure reason without exposing unrelated event data. Recipient preferences and required operational notices MUST be represented distinctly.

#### Scenario: Notify an enrolled participant

- GIVEN an event E publishes an eligible schedule or enrollment update
- WHEN notification rules select a participant
- THEN a notification is created for that participant and event E
- AND its delivery outcome is visible to authorized operators

#### Scenario: Handle an undeliverable notification

- GIVEN a destination is unavailable or a recipient is no longer eligible
- WHEN delivery is attempted
- THEN the notification is marked failed or suppressed with a reason
- AND the system does not retry outside the configured policy or disclose another event

### Requirement: Public Results Publication

The system MUST publish public results only from authoritative, finalized competition state and MUST support explicit event and result publication controls. Public views MUST exclude non-public participant, credential, incident, financial, and audit data and MUST identify event, category, match, status, and update time.

#### Scenario: Publish finalized results

- GIVEN an authorized organizer approves finalized results for event E
- WHEN publication is enabled
- THEN the public result view shows the approved authoritative outcome for E
- AND the publication decision is audited

#### Scenario: Prevent premature publication

- GIVEN a result is provisional, conflicted, or belongs to an unpublished event
- WHEN a user requests public publication
- THEN publication is rejected
- AND no provisional or cross-event data is exposed publicly

### Requirement: Scoped Export and Audit

The system MUST provide authorized exports for the requesting event and permitted data purpose, identify the dataset scope and generation time, and record requester, filters, outcome, and destination handling. Exports MUST respect redaction, retention, and country-dependent privacy decisions; unresolved legal retention or deletion rules are **blocked/deferred** until the country is named.

#### Scenario: Export an event report

- GIVEN an authorized operator selects event E and an allowed report
- WHEN the export is generated
- THEN it contains only permitted event E data and declares its scope and generation time
- AND the request and result are auditable

#### Scenario: Deny an unsafe export

- GIVEN a requester lacks permission, requests another event, or selects protected credentials or secrets
- WHEN export is requested
- THEN the request is denied or safely redacted
- AND the denial is recorded without revealing protected values

### Requirement: Accessible Branded Communication

Public results, notifications, and reporting workspaces MUST remain readable and operable across responsive viewport sizes, keyboard navigation, and assistive technology. Event branding MAY customize presentation but MUST preserve meaningful headings, status text, focus visibility, and non-color communication of errors and outcomes.

#### Scenario: Read results on a small viewport

- GIVEN a public user opens event results on a narrow viewport or with assistive technology
- WHEN the result state changes
- THEN event identity, category, result, and update state remain perceivable
- AND the user can navigate the available content without relying on color or pointer-only controls
