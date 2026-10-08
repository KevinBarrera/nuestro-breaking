# Planned Event-Day Runbook

This planning-only runbook describes safe future operator behavior for a
connected event. It does not authorize a release, confirm live tooling, or
claim operational readiness.

## Prerequisites

Before an event can use future live workflows, an authorized operator must have
an active event-scoped role, confirmed event/venue context, required
connectivity, and an implemented status/recovery experience. QR and PIN are
planned restricted credentials, not unrestricted identity proof. PostgreSQL is
the planned authority for accepted decisions; client views and realtime
projections are not.

Required future ownership includes event operations, access/security,
engineering/operations, incident response, and public-result publication.
Legal, privacy, retention, minor-data, financial, and country-specific policy
decisions remain deferred.

## Expected operator actions

1. Confirm the displayed event, venue or station, authorized role, and current
   connection/recovery state before a live action.
2. Use only the future server-authoritative workflow; treat safe denials,
   stale-version outcomes, and duplicate outcomes as instructions to obtain the
   current authoritative state.
3. On the event day, designate a specific event-authorized administrator and
   record when that person takes ownership of the paper fallback. Before each
   activity, that administrator may print the current list from the browser or
   save it as PDF. Include name, AKA, pass, activity, registration and
   attendance status (event and activity where relevant) only; exclude contact
   information. A print/PDF is a
   snapshot and may already be stale; check current authoritative state before
   any permitted connected write. If connectivity fails, the designated
   administrator records day-of incidents on paper, then checks for duplicates
   and manually reconciles each case against current authoritative state.
   Paper is not an offline platform or a queued command; never blindly replay
   registrations, payments, or check-ins.
4. For a completed check-in, score, assignment, or incident update, rely on
   the returned current status rather than a remembered or cached result.
5. For public competition results, request publication only for authorized,
   finalized event-scoped outcomes. Do not expose participant, credential,
   incident, financial, audit, notification, or export data.
6. Record only minimum operational context for escalation. Do not place
   passwords, QR values, PINs, session identifiers, or sensitive participant
   details in general notes.

## Safe stop conditions

- Connectivity, authorization, event scope, or current recovery state is
  missing or ambiguous.
- A command is rejected as stale, conflicted, out of scope, unauthorized, or
  not durably auditable.
- A projection disconnects, has a sequence gap, or cannot recover from an
  authoritative snapshot.
- A workflow requires unresolved legal, privacy, minor-data, retention,
  financial, or country-specific policy.

Stop the affected action, preserve the current safe status, and escalate. Do
not use offline platform writes, local queues, automatic sync, or blind manual
replay. Paper may keep the event moving, but does not authorize a platform write
when connectivity, scope, status, or audit is uncertain.

## Registration correction boundary

Only event-authorized administrators, not judges, may perform bounded audited
name/AKA corrections after confirming shared cross-event identity impact;
equal-price Breaking/Popping/Locking/Dancehall swaps; or justified pending
voids. All event-scoped administrators may use those bounded corrections and
read their event's operation history, never judges; access mechanics remain
pending. A separate bounded cash correction is approved in principle, requiring
coordination staff verification, reason, minimum evidence and preserved original
confirmation/payment facts; its allowed transitions and guards must be defined
before use. Escalate paid cases requiring reversal to the principal organizer
outside automated MVP correction; no generic confirmed-state edit or void,
Mercado Pago payment edit or refund is authorized.
Transfers, general-to-participant upgrades and folio edits are excluded.
Two years of history is desired subject to feasibility and legal review, not
an implemented retention policy. None of these commands is made live by this
runbook.

## Escalation and ownership gaps

The planned system has no assigned event-day escalation roster, service levels,
implemented observability, or production incident process. Before activation,
the organization must assign owners for access revocation, connectivity and
snapshot recovery, sensitive incidents, support disclosure, and public-result
corrections.

Escalate suspected credential compromise, cross-event exposure, unavailable
authoritative state, or sensitive incident details to the future designated
owner. If no owner is available, keep the affected workflow stopped.

## Explicitly unavailable procedures

- Live dashboards, connection probes, snapshots, acknowledgements, and operator
  consoles are not implemented by this runbook.
- Credential issuance, rotation, recovery, revocation, rate-limit, and station
  control procedures are future implementation work.
- Database restore, migration rollback, realtime scaling, and recovery-drill
  procedures are unavailable.
- Legal consent, retention, guardian/minor-data, tax, payment, invoice, payout,
  prize, settlement, and country-specific operational procedures are deferred.

## Planning references

- [API and Event Versioning Contract](../contracts/api-event-versioning.md)
- [Privacy and Security Threat Model](../security/privacy-threat-model.md)
- [ADR 0003: Credential trust](../adr/0003-credential-trust.md)
- [ADR 0004: Realtime transport](../adr/0004-realtime-transport.md)
- [ADR 0005: Connectivity-only policy](../adr/0005-no-offline-policy.md)
