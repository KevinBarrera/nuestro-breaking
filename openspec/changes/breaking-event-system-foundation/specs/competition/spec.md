# Competition Specification

## Purpose

Define categories, qualifiers, brackets, judge rubrics, authoritative scoring, projections, and recovery.

## Requirements

### Requirement: Competition Structure and Eligibility

The system MUST define event-scoped categories, eligibility conditions, qualifier rules, and bracket seeding. It MUST prevent entry when required conditions fail and MUST preserve the rule version used for a decision.

#### Scenario: Advance an eligible qualifier

- GIVEN a competitor satisfies the published category and qualifier rules for event E
- WHEN an authorized competition operator confirms the qualifier outcome
- THEN the competitor advances to the permitted bracket position
- AND the applied rule version is recorded

#### Scenario: Reject an invalid advancement

- GIVEN a competitor does not satisfy a category rule or the target bracket is closed
- WHEN an advancement is requested
- THEN the request is rejected
- AND the existing bracket state remains authoritative

### Requirement: Bracket Lifecycle

The system MUST maintain event-scoped bracket states, match order, assignments, and transitions. Bracket changes MUST be authorized, version-checked, and auditable; a completed match MUST NOT be silently replaced by a conflicting update.

#### Scenario: Complete a match

- GIVEN a published bracket has an active match and eligible competitors
- WHEN an authorized operator records its accepted outcome
- THEN the match becomes complete and the next permitted bracket state is derived
- AND the transition is visible to authorized workspaces

#### Scenario: Detect a stale bracket update

- GIVEN two operators hold different bracket versions
- WHEN the older version attempts a change
- THEN the system rejects it as stale
- AND the operator must retrieve the authoritative state before retrying

### Requirement: Judge Rubrics and Scoring

The system MUST associate judge rubrics and scoring criteria with the relevant category or match. Score submissions MUST be attributable, event-scoped, rubric-validated, and accepted only through the server-authoritative scoring contract; duplicates MUST be idempotent or rejected.

#### Scenario: Submit a valid judge score

- GIVEN an authorized judge is assigned to an active match with a published rubric
- WHEN the judge submits a valid score once
- THEN the server records the score and rubric version
- AND the authoritative match state incorporates it according to the scoring rules

#### Scenario: Reject an invalid or unauthorized score

- GIVEN the judge is unassigned, the match is closed, or a score is outside the rubric
- WHEN a score is submitted
- THEN the server rejects it
- AND no projection or result is updated

### Requirement: Authoritative Results and Recovery

The server MUST be authoritative for sequencing, validation, idempotency, score aggregation, bracket transitions, and results. Clients and projections MUST reconcile from versioned state; after reconnect or projection loss, a client MUST recover a consistent snapshot and continue only from the current version. Offline or manual event-day operation is **out of scope/deferred**.

#### Scenario: Recover a live projection

- GIVEN a projection disconnects after receiving competition updates
- WHEN it reconnects and requests the current event state
- THEN it receives an authoritative version and consistent public projection
- AND it does not replay stale local decisions as new scores

#### Scenario: Resolve concurrent score submissions

- GIVEN multiple valid judge submissions arrive for the same match
- WHEN the server processes them
- THEN each accepted submission is sequenced exactly once according to the scoring contract
- AND conflicting or duplicate requests return a deterministic result

### Requirement: Competition Experience

Judge and operator workspaces MUST be responsive, keyboard-operable, assistive-technology compatible, and brandable; public projections MUST communicate match, score, status, and update state without color alone.

#### Scenario: Operate scoring accessibly

- GIVEN a judge uses a supported narrow or wide viewport
- WHEN the judge reviews criteria and submits a score
- THEN the rubric, validation state, and submission result are perceivable and operable
- AND the event identity remains visible
