# Identity and Access Specification

## Purpose

Define scoped roles, lifecycle-managed QR/PIN credentials, authorization decisions, and traceable access activity.

## Requirements

### Requirement: Scoped Role Lifecycle

The system MUST assign roles to identities with explicit organization, event, venue, station, or session scope as applicable. Roles MUST have an approval, active, suspended, and revoked lifecycle, and authorization MUST evaluate current scope and lifecycle state for every protected action.

#### Scenario: Activate event staff access

- GIVEN an authorized organizer assigns an approved staff identity to event E and a permitted role
- WHEN the assignment is activated
- THEN the staff member can perform only actions allowed by that role within event E
- AND the assignment is auditable

#### Scenario: Deny revoked or cross-event access

- GIVEN a role assignment is revoked or belongs to event A
- WHEN its holder requests a protected action for event B
- THEN the request is denied
- AND the response does not disclose protected data

### Requirement: QR and PIN Credential Lifecycle

QR and PIN credentials MUST be treated as scoped bearer credentials, not unrestricted identity proof. Each credential MUST have an owner or assignment, permitted scope, issuance time, expiry, revocation state, and use policy; expired, revoked, over-threshold, or out-of-scope use MUST fail. PIN attempts MUST be rate-limited, and higher-risk actions MUST require the configured additional verification or station/session control.

#### Scenario: Use a valid credential

- GIVEN a credential is active, unexpired, within its assigned event and station scope, and its role permits the action
- WHEN it is presented
- THEN the action proceeds within that scope
- AND the use is recorded for audit

#### Scenario: Expire or revoke a credential

- GIVEN a QR or PIN credential has expired or been revoked
- WHEN it is presented
- THEN access is denied even if the encoded value is correct
- AND repeated failures do not reveal whether the credential was expired or revoked

### Requirement: Immutable Security Audit

The system MUST record successful and failed credential, authorization, role, and sensitive-action decisions with event scope, actor or credential reference, time, device or station context, outcome, and reason. Financial, accreditation, bracket, and scoring decisions MUST include before/after values or a decision payload where applicable, and audit records MUST be protected from ordinary alteration.

#### Scenario: Review a sensitive decision

- GIVEN an authorized reviewer requests the audit history for event E
- WHEN a score, access, or accreditation decision is selected
- THEN the system shows who or what acted, when, where, the outcome, and the relevant change
- AND the entry is tied to event E

#### Scenario: Audit service degradation

- GIVEN an action requires a security audit record but the record cannot be durably accepted
- WHEN the action is attempted
- THEN the sensitive action is not reported as successful
- AND the failure is observable without exposing secrets

### Requirement: Release 1 Secure Sign-In and Session Revocation

For Release 1, the system MUST authenticate username/password sign-in on the server, create an opaque server-side session, and expose only a protected session identifier to the browser. Failed sign-in, expired session, and revoked session responses MUST deny access without disclosing whether an account, credential, or session exists. Session creation, denial, and revocation MUST be durably audited.

#### Scenario: Establish a secure session

- GIVEN an active identity supplies valid sign-in credentials
- WHEN the server accepts the sign-in request
- THEN it creates an active server-side session and returns only its protected identifier
- AND the successful sign-in is auditable

#### Scenario: Safely deny or revoke a session

- GIVEN a sign-in attempt is invalid or an existing session is expired or revoked
- WHEN the browser requests a protected Release 1 workflow
- THEN access is denied without revealing which condition applied
- AND the denial or revocation is auditable
