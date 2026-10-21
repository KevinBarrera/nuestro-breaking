# Planned Event-Day Runbook

This planning-only runbook describes safe future operator behavior for a
connected event. It does not authorize a release, confirm live tooling, or
claim operational readiness. The exception is "Venta en el lugar", which
describes admin screens that are already built (#105).

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

## Venta en el lugar

The in-person sale (#105) runs in the admin panel under "Operación ›
Inscripciones". It needs an event administrator; the platform decides every
outcome, and the screen only shows what it answered.

1. Search first in "Buscar inscripción" (name, email, AKA, folio or cash
   receipt number). If the person already has a registration marked "Pendiente
   de pago", open its card ("Continuar venta") and continue from step 3.
2. Otherwise choose "Nueva inscripción", fill in the participant (name, first
   last name, email and phone are required) and press "Registrar". If "¿Es la
   misma persona?" opens, compare the listed matches: "Continuar con esta
   inscripción" (pending matches only) opens the existing registration; "Es
   otra persona, registrar" creates a new one.
3. In "Agregar pase", press "Agregar" on each pass and confirm the dialog.
   Passes that cannot be added show the reason instead of the button. A pass
   added by mistake can be removed with "Quitar" next to it, before the payment
   is confirmed; remove an add-on before the pass it requires. After
   confirmation, passes cannot change (#256); competitions can, with a reason
   (step 7).
4. In "Competencias", check the competitions for each pass and press "Guardar
   competencias". Checks you have not saved stay while you add passes, but the
   payment cannot be confirmed until each pass is saved or "Descartar cambios"
   is pressed.
5. Take the cash for "Total a cobrar". The total is the sum of the passes,
   read-only, with no service charge. Write the paper receipt number in
   "Número de recibo" (optional "Nota") and press "Confirmar pago". A receipt
   number already used in this event is rejected; check the paper receipt.
   If the passes total $0 (golden tickets and guests, #263), there is no cash
   section: write why it is free in "Motivo" (for example "Golden ticket,
   ganador de …"; required, up to 500 characters) and press "Confirmar sin
   cobro". The reason stays in the registration audit.
6. Confirm the dialog, then read the folio shown (for example `LMP-7K3Q`) to
   the participant. It is not the paper receipt number. Both the cash and the
   without-payment confirmation send the participant the confirmation email
   with the folio.
7. To change the competitions of a confirmed registration, open it, press
   "Editar competencias" on the pass, check the new competitions, write why in
   "Motivo del cambio" (required, up to 500 characters) and press "Guardar
   cambios". Check the before and after in the dialog and press "Cambiar
   competencias". The reason stays in the registration audit.

If the screen says "No pudimos confirmar si el pago se registró", press
"Recargar" and read the status. Never charge again or confirm a second time
before reloading: the first payment may already be recorded. The same applies
when a confirmation without payment, adding a pass or saving competitions
cannot be confirmed. If a confirmation without payment says the registration
no longer has passes or now has an amount to charge, press "Recargar": someone
changed its passes, and a priced registration goes back to the cash payment.

No account gets the judge role for now. Registration search would still admit
a judge, so reopen #262 before creating one.

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
The registration folio (for example `LMP-7K3Q`) is assigned by the platform
when a registration is confirmed and can never be edited; it is not the number
on the paper cash receipt.
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
