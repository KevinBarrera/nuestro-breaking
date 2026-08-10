# Privacy and Security Threat Model

This planning-only model records threats, intended safeguards, residual risks,
and decision gaps for the future event system. It does not implement a control,
approve a release, select a legal policy, or establish compliance or production
readiness.

## Scope and status

- Covers future authentication, QR/PIN credentials, sessions, REST commands,
  Socket.IO projections, audit/outbox facts, exports, operations/support, and
  public projections.
- Distinguishes planned safeguards from existing implementation. No safeguard
  in this document is evidence that a control exists or operates in production.
- Applies to the non-user Foundation Gate and its four separately authorized
  vertical releases. The Foundation Gate remains incomplete; this document does
  not authorize any product release.

## Planned data and authority boundaries

PostgreSQL remains the planned authoritative state for business decisions,
sessions, credentials, and protected records. An owning module is planned to
commit its authoritative change with required redacted audit and ordered outbox
facts in one transaction. Audit/outbox records have bounded roles: they record
decisions and publication intent; they do not replace current state or grant
access.

Public projections are bounded, read-only derivatives of permitted,
authoritative facts. They may lag, and they must recover from an authoritative
snapshot. A projection, cached browser state, or realtime transport is never a
command source or system of record.

## Threat register

| Area                         | Threat                                                                                                                       | Planned safeguards                                                                                                                                                                                                    | Residual risk and decision gap                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication               | Credential stuffing, account enumeration, session theft, or CSRF could expose protected workflows.                           | Server-side username/password authentication; Argon2id verification; opaque PostgreSQL sessions; protected cookie attributes; expiry, revocation, CSRF/origin protection; safe denials; durable authentication audit. | Session lifetime, renewal, deployment parameter benchmarking, incident response, and operational ownership are unresolved.                                               |
| QR/PIN credentials           | A copied QR or observed PIN could be reused beyond the intended operator or station.                                         | Treat QR as an opaque bearer secret and PIN as a verifier; apply event/role/station scope, expiry, rotation, revocation, throttling, least privilege, and auditable success/failure decisions.                        | Credentials remain transferable and are not unrestricted identity proof. Issuance, recovery, rate limits, and audit-retention ownership are deferred.                    |
| Sessions and authorization   | Stale, revoked, or cross-event roles could retain access or disclose protected data.                                         | Re-evaluate active scoped roles and session state for every protected action; deny expired, revoked, out-of-scope, and cross-event access without revealing sensitive state.                                          | Privileged-access review, device/session handling, support escalation, and authorization-monitoring thresholds require future decisions.                                 |
| REST commands                | Replay, stale writes, unauthorized commands, or cross-event references could alter authoritative records.                    | Use planned REST/OpenAPI command envelopes with event, command, and expected-version identifiers; validate lifecycle, scope, authorization, idempotency, and durable audit before reporting success.                  | Concrete schemas, status codes, abuse controls, observability, and operational ownership are not selected here.                                                          |
| Future Socket.IO realtime    | Reconnect gaps, duplicate messages, or a client-authoritative path could misstate live competition results.                  | Keep commands server-authoritative; use ordered, versioned projections, acknowledgements, event/role rooms, and snapshot recovery after a gap or reconnect.                                                           | Broker/adapter topology, multi-instance scaling, gateway authorization details, recovery drills, and monitoring remain deferred. No offline or manual replay is planned. |
| Audit and outbox             | Missing, altered, or overexposed facts could hide sensitive decisions or leak protected data.                                | Plan append-only, redacted audit facts and ordered outbox facts committed with accepted changes; do not report a sensitive action as successful when required audit durability is unavailable.                        | Retention, access review, tamper-detection operations, export handling, and degradation ownership are unresolved. Audit/outbox are not independently authoritative.      |
| Exports and support          | A report, export, ticket, log, or support workflow could expose participant, credential, incident, financial, or audit data. | Limit views to the minimum permitted data, redact logs, restrict sensitive incident details, and require future authorization and audit boundaries for exports.                                                       | Exports are deferred from Release 2. Support access model, redaction standards, disclosure workflow, retention, and escalation ownership require separate work.          |
| Operations and accreditation | Shared stations, staff error, or incident access could expose attendee data or create unsafe check-in/attendance records.    | Plan event-scoped, idempotent, least-privilege workflows; station/session controls; safe errors; and audit for check-in, attendance, assignment, and incident decisions.                                              | Device custody, operator training, incident/medical handling, and event-day support and recovery procedures are unresolved.                                              |
| Public projections           | Provisional, cross-event, or sensitive data could be published or remain visible after a state change.                       | Publish only authorized, finalized competition results with explicit event and publication controls; exclude participant, credential, session, incident, financial, audit, notification, and export data.             | Publication review ownership, correction/removal handling, cache behavior, audience policy, and public-data retention are not decided.                                   |

## Safeguard status

| Category                       | Status in this change                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing implementation        | None is asserted by this planning document.                                                                                                                               |
| Planned technical safeguards   | Scoped authorization, safe denials, credential/session lifecycle controls, durable redacted audit, ordered outbox, versioned commands/projections, and snapshot recovery. |
| Planned operational safeguards | Least-privilege views, restricted support/incident access, redacted logs, connectivity-aware recovery, and future runbooks.                                               |
| Explicitly deferred safeguards | Retention/deletion execution, export controls, legal wording, consent flows, minor-data handling, payment/tax controls, and regulated-domain controls.                    |

## Legal and policy deferrals

Mexico is the planning country only. Legal, privacy, consent, retention,
deletion, minor-data, guardian, waiver, tax, invoice, payment, payout, prize,
settlement, medical/incident, regulated-domain, cross-border, marketing, and
country-specific decisions are deferred to qualified legal, policy, financial,
and operational review.

This document does not select retention periods, approve consent or waiver
flows, define lawful bases, approve terms, or determine legal sufficiency. It
makes zero compliance, legal-advice, certification, or production-readiness
claims.

## Ownership and escalation gaps

The following ownership must be assigned before affected behavior is designed
or activated:

| Gap                                                                           | Required future owner or escalation                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Privacy, consent, retention, minors, waivers, and regulated data              | Legal/policy owner with recorded decision and implementation requirements. |
| Taxes, invoices, payments, payouts, prizes, refunds, and settlements          | Legal/policy and approved financial owner.                                 |
| Security incidents, access reviews, audit degradation, and support disclosure | Security/operations owner with escalation and recovery procedures.         |
| Public-result approval, correction, and removal                               | Authorized event/communications owner with documented publication policy.  |
| Realtime recovery, connectivity, and multi-instance operation                 | Engineering/operations owner after transport topology is decided.          |

Until those owners and decisions exist, affected regulated or sensitive
behavior remains blocked or planning-only. The vertical-release plan is
unchanged: Release 1 is Accreditation, Release 2 is Competition Live with only
the public competition projection, Release 3 is Workshops and Basic Operations,
and Release 4 is non-regulated Commerce. Each requires separate authorization.

## Cross-references

### Architecture decisions

- [ADR 0001: Operating country](../adr/0001-operating-country.md)
- [ADR 0002: Identity sessions](../adr/0002-identity-session.md)
- [ADR 0003: Credential trust](../adr/0003-credential-trust.md)
- [ADR 0004: Realtime transport](../adr/0004-realtime-transport.md)
- [ADR 0005: No offline policy](../adr/0005-no-offline-policy.md)

### Planning and capability specifications

- [Proposal](../../openspec/changes/breaking-event-system-foundation/proposal.md)
- [Design](../../openspec/changes/breaking-event-system-foundation/design.md)
- [Identity and Access](../../openspec/changes/breaking-event-system-foundation/specs/identity-access/spec.md)
- [Participant Accreditation](../../openspec/changes/breaking-event-system-foundation/specs/participant-accreditation/spec.md)
- [Competition](../../openspec/changes/breaking-event-system-foundation/specs/competition/spec.md)
- [Operations](../../openspec/changes/breaking-event-system-foundation/specs/operations/spec.md)
- [Communications and Reporting](../../openspec/changes/breaking-event-system-foundation/specs/communications-reporting/spec.md)
- [Data Lifecycle Model](../models/data-lifecycle.md)
- [API and Event Versioning Contract](../contracts/api-event-versioning.md)
- [Mexico Readiness Checklist](../legal/mexico-readiness-checklist.md)
