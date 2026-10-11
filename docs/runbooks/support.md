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
**Agregar administrador** opens the invite form. The API behind them is
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
  exists. While still signed in, a global administrator can regenerate a link
  for themself.

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
