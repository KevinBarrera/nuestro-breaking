# Communications and Reporting Specification

## Purpose

Define the Release 2 public competition projection. Notifications and exports are deferred to later authorized work; Mexico remains the planning country and any regulated privacy behavior remains blocked pending legal/policy review.

## Requirements

### Requirement: Public Competition Projection

Release 2 MUST publish public competition projection only from authoritative, finalized competition state and MUST support explicit event and result publication controls. Public views MUST exclude non-public participant, credential, incident, financial, and audit data and MUST identify event, category, match, status, and update time. Notifications and exports MUST NOT be included in Release 2.

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

### Requirement: Accessible Branded Communication

The public competition projection MUST remain readable and operable across responsive viewport sizes, keyboard navigation, and assistive technology. Event branding MAY customize presentation but MUST preserve meaningful headings, status text, focus visibility, and non-color communication of errors and outcomes.

#### Scenario: Read results on a small viewport

- GIVEN a public user opens event results on a narrow viewport or with assistive technology
- WHEN the result state changes
- THEN event identity, category, result, and update state remain perceivable
- AND the user can navigate the available content without relying on color or pointer-only controls
