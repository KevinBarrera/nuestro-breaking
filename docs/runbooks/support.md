# Planned Support Handling Runbook

This is a planning-only guide for future support handling. It does not create a
support service, access model, retention policy, incident process, or legal or
privacy compliance claim.

## Prerequisites

Future support work requires an assigned support owner, documented
least-privilege access, an event-scoped case reference, approved redaction
rules, and an escalation path for security, operations, and legal/policy gaps.
No such implementation-dependent tooling or ownership is established here.

Support must treat PostgreSQL as the planned authoritative source for accepted
state. A cached client view, public projection, audit fact, or outbox fact is
not authority and must not be used to invent a recovery outcome.

## Expected operator actions

1. Collect the minimum context needed to route a case: event, authorized
   requester role, time, affected workflow, visible safe status, and a
   non-sensitive reference.
2. Redact or avoid participant details, credentials, passwords, QR values,
   PINs, session identifiers, financial information, incident details, audit
   payloads, and other unnecessary protected data.
3. Confirm only the current safe status available to the authorized requester.
   Do not disclose whether a credential, account, session, or protected record
   exists when access is denied.
4. For a disconnect or stale projection, direct the future authorized operator
   to stop live action and use snapshot recovery after connectivity returns; do
   not accept local decisions for later replay.
5. Escalate suspected unauthorized access, cross-event exposure, audit
   degradation, sensitive incidents, or unresolved policy questions without
   expanding support access.

## Safe stop conditions

- The requester lacks verified event scope or authorization.
- The requested detail is sensitive, cross-event, financial, incident-related,
  credential-related, or otherwise outside the minimum permitted view.
- The support operator cannot identify an authoritative current state or an
  approved escalation owner.
- A request depends on a legal/privacy/retention/minor-data/financial or
  country-specific decision that remains deferred.

Stop disclosure or recovery guidance at that boundary and escalate. Do not use
offline operation, local records, or manual event replay as a support remedy.

## Managing the team

Unlike the planned sections above, this one describes implemented behavior
([#214](https://github.com/KevinBarrera/nuestro-breaking/issues/214)). Only a
**global administrator** can manage the team, from the admin panel's
**Equipo** page (side navigation, "Administración" group; other admins do not
see it). Each row offers the actions below as buttons: **Nuevo enlace**,
**Cancelar invitación**, **Cambiar acceso**, **Desactivar** and **Reactivar**;
your own row shows "—" and offers none. **Agregar administrador** opens the
invite form. The API behind them is
described in the
[admin authentication boundary](../contracts/admin-auth-boundary.md#team-management-api-214).

For a brand-new environment with no administrator yet, use the
[admin bootstrap runbook](admin-bootstrap.md) instead.

| I need to…                       | Do this                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add someone                      | Invite them with their name, email and access: every event (global) or only some events. You get an activation link.                               |
| Give them the link               | Share it privately (direct message, in person), never in a public channel, ticket or repository. It is shown only once and works for 72 hours.     |
| The link expired or was lost     | Regenerate the link. The old one stops working at once.                                                                                            |
| Someone forgot their password    | Regenerate a link for them; they choose a new password from it. Their current password keeps working until they use the link. Nobody else sets it. |
| Change which events someone sees | Change their access. It applies on their next action; they stay signed in.                                                                         |
| Remove someone's access          | Deactivate them with a short reason. They are signed out everywhere at once, and any open link stops working.                                      |
| Bring someone back               | Reactivate them. If they had set a password, it works again; if they never did, regenerate a link.                                                 |

### Rules to keep in mind

- **There is always at least one global administrator.** The system refuses
  to deactivate, or move to event-only access, the last global administrator
  who has activated their account.
- **You cannot deactivate yourself or change your own access.** Ask another
  global administrator.
- An email that already has an account cannot be invited again. Regenerate or
  reactivate the existing member instead.
- Every action (invite, regenerate, cancel, access change, deactivate,
  reactivate, activation) is recorded with who did it, to whom, when and the
  reason.
- **Keep at least two activated global administrators.** If the only one
  forgets their password while signed out, nobody can issue them a new link,
  and `admin:bootstrap` refuses because an activated global administrator
  exists. The panel offers no actions on your own row, so a new link always
  comes from another global administrator (the API still accepts a link for
  yourself).

## Archiving and deleting events

This section also describes implemented behavior
([#213](https://github.com/KevinBarrera/nuestro-breaking/issues/213); API in
the [admin event lifecycle contract](../contracts/admin-event-lifecycle.md)).
Only a **global administrator** can archive, restore or delete an event.

| I need to…                                  | Do this                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retire an event that is over, or a test one | **Archive** it. Sales close, the public page answers "not found", and every registration, payment and check-in stays readable.                           |
| Bring an archived event back                | **Restore** it. Sales stay closed; open them again on purpose.                                                                                           |
| Remove an event created by mistake          | **Delete** it, typing its slug to confirm. This works only while the event is empty: no activities, passes, registrations, check-ins or catalog history. |
| Delete is refused ("not empty")             | Archive it instead. The answer lists what blocks the delete. Anything with sales or history is kept for buyer and payment follow-up.                     |

### Rules to keep in mind

- **Archiving does not stop payments already started.** A buyer can still
  check their payment status, and a late Mercado Pago confirmation is still
  recorded with a folio.
- An archived event cannot be edited, and sales cannot be turned on until it is
  restored.
- Deleting frees the slug for a new event. It also removes access granted only
  for that event; a member whose only access was that event stays in
  **Equipo** as "Sin acceso". Use **Cambiar acceso** to give them other
  events (or all of them); inviting the same email again is refused.
- Every create, edit, archive, restore and delete is recorded with who did it
  and when, and the record outlives a deleted event.

## Expired online registrations and late payments

This section describes implemented behavior
([#181](https://github.com/KevinBarrera/nuestro-breaking/issues/181); rules in
the [public registration contract](../contracts/public-registration.md#payment-window-181)).

An online buyer has `PENDING_PAYMENT_HOURS` (default 72) to pay after each
checkout; the pending registration expires one day later and the system voids
it. Admin manual (cash) registrations never expire. If Mercado Pago later
approves a payment for an expired registration:

| Case                                                             | What the system does                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The event has not ended and the person has no other registration | Confirms it with a folio and sends the confirmation email. The audit marks it as a late approval.   |
| The person already has another pending or confirmed registration | Stores the payment, keeps the registration voided and flags it `approved_after_expiry_duplicate`.   |
| The event already ended                                          | Stores the payment, keeps the registration voided and flags it `approved_after_expiry_event_ended`. |

On the expiry sweep's interval (`PENDING_EXPIRY_SWEEP_INTERVAL_MS`, default
5 minutes), the backend also searches the
Mercado Pago payments of each online registration that expired in the last 30
days, once per registration. A payment whose notifications never arrived (for
example during a credential outage) is then applied by the same rules; its
outcome is logged with a notification id starting with `reconciliation:`.

Flagged payments need coordination's decision; nothing is refunded
automatically. An administrator of the event sees them in the admin panel under
**Pagos por revisar** (`/admin/events/:eventId/payments-review`, #230): a table
with one row per Mercado Pago payment (case, person, folio, amount and Mercado
Pago payment id), below a guide that says what to do for each case. Besides the two
expiry flags above, it lists `approved_after_confirmation` (paid again for a
registration already confirmed) and `approved_after_void` (paid for a
registration voided for another reason). A payment leaves the list once a later
Mercado Pago notification changes its outcome, for example after a refund. See
the [flagged payments contract](../contracts/flagged-payments.md).

A duplicate usually means the buyer paid twice (an old OXXO voucher and a new
purchase): refund one payment in Mercado Pago. Registering a person in cash
after their online registration expired is not possible yet, because the
expired registration still counts as a duplicate; that belongs to #104.

## Escalation and ownership gaps

Future owners must define support access approval, redaction standards, case
retention, breach/disclosure response, credential recovery, audit review,
incident triage, and legal/policy review. No named support, privacy, security,
operations, financial, or legal owner; response time; or service level is
defined by this document.

If an owner has not been assigned, preserve minimum non-sensitive context and
keep the case blocked rather than making an unsupported disclosure or change.

## Explicitly unavailable procedures

- Support console, ticketing system, access-review workflow, case retention,
  audit search, and disclosure-notification procedure.
- Participant account or credential recovery, session inspection, reset,
  revocation, or identity-proofing procedure. (Admin access recovery is
  covered in [Managing the team](#managing-the-team).)
- Production log access, incident-response playbook, database repair, restore,
  or manual data-replay procedure.
- Jurisdiction-specific consent, retention/deletion, guardian/minor-data, tax,
  payment, invoice, payout, prize, settlement, or regulatory procedure.

## Planning references

- [Privacy and Security Threat Model](../security/privacy-threat-model.md)
- [Data Lifecycle Model](../models/data-lifecycle.md)
- [API and Event Versioning Contract](../contracts/api-event-versioning.md)
- [ADR 0002: Identity sessions](../adr/0002-identity-session.md)
- [Admin bootstrap runbook](admin-bootstrap.md)
- [ADR 0005: Connectivity-only policy](../adr/0005-no-offline-policy.md)
