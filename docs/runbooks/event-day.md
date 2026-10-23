# Planned Event-Day Runbook

This planning-only runbook describes safe future operator behavior for a
connected event. It does not authorize a release, confirm live tooling, or
claim operational readiness. The exceptions are "Venta en el lugar" and
"Listas de respaldo y contingencia en papel", which describe admin screens that
are already built (#105, #65).

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
3. Prepare the paper fallback before the event and follow it during an outage
   as described in "Listas de respaldo y contingencia en papel". Paper is not
   an offline platform or a queued command; never blindly replay
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
   confirmation, passes cannot change (#256), except a same-price discipline
   swap (step 10); competitions can, with a reason (step 7).
4. In "Competencias", check the competitions for each pass and press "Guardar
   competencias". Checks you have not saved stay while you add passes, but the
   payment cannot be confirmed until each pass is saved or "Descartar cambios"
   is pressed.
5. Take the cash for "Total a cobrar". The total is the sum of the passes,
   read-only, with no service charge. Write the paper receipt number in
   "Número de recibo" (optional "Nota") and press "Confirmar pago". A receipt
   number already used in this event is rejected; check the paper receipt. A
   wrong amount or receipt can be corrected later (step 11).
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
8. To void an in-person registration made by mistake (for example, the same
   person registered twice) while it is still "Pendiente de pago", press
   "Anular inscripción" at the end of the sale, write why in "Motivo"
   (required, up to 500 characters) and confirm. It cannot be undone; register
   the person again if needed. Online pending registrations have no such
   action: they are voided on their own when the payment window ends. A
   confirmed registration cannot be voided; escalate paid cases to the
   principal organizer.
9. To fix a misspelled name or AKA on a pending or confirmed registration,
   online or in person, press "Corregir nombre o AKA", fix the fields, write
   why in "Motivo" (required, up to 500 characters) and press "Guardar
   corrección". If the dialog says the person appears in other events, check
   it is the right person and press "Confirmar corrección": only this
   registration changes, never the other events. A voided registration cannot
   be corrected. The reason stays in the registration audit.
10. To move a pending or confirmed registration from one discipline to another
    of the same price (for example Breaking to Popping), press "Cambiar
    disciplina", choose the pass in "Pase nuevo", check its competitions,
    write why in "Motivo" (required, up to 500 characters), press "Revisar
    cambio" and confirm with "Cambiar disciplina". The amount paid does not
    change. It only works when the registration has exactly one full pass and
    the person has not entered the event yet: after the entry check-in the
    swap is blocked ("Esta persona ya registró su entrada al evento…"), and
    swaps with several full passes or a different price are not supported.
    The reason stays in the registration audit.
11. To correct the amount or the receipt number of a confirmed cash payment,
    first find and check the original paper receipt. Then, in "Pago en
    efectivo", press "Corregir pago en efectivo", fix "Monto (MXN)" or
    "Número de recibo", write why in "Motivo" (required, up to 500
    characters), check "Revisé el recibo original", press "Revisar
    corrección" and confirm with "Corregir pago". An amount different from
    the passes' total is allowed after the warning. A receipt number already
    used in this event is rejected. A payment recorded before receipts were
    required ("Sin número de recibo") can get one. The previous values and the
    reason stay in the registration audit. Do not use it, and escalate to the
    principal organizer instead, when the cash was recorded on the wrong
    registration, was recorded without money received, or the original
    receipt is missing or disputed.
12. To check a correction afterwards, open "Historial" in the side navigation
    ("Operación", right after "Inscripciones"). It lists every operation of
    the event, newest first, with when it happened, who did it ("Por …"),
    what changed and "Motivo: …". Check "Solo correcciones" to keep voids,
    name/AKA, discipline and cash corrections and competition changes on
    confirmed registrations. Press "Cargar más" for older entries, and the
    participant's name to open the registration. Historial is read only: to
    fix something, go back to the registration. Judges cannot open it.

If the screen says "No pudimos confirmar si el pago se registró", press
"Recargar" and read the status. Never charge again or confirm a second time
before reloading: the first payment may already be recorded. The same applies
when a confirmation without payment, adding a pass or saving competitions
cannot be confirmed. If a confirmation without payment says the registration
no longer has passes or now has an amount to charge, press "Recargar": someone
changed its passes, and a priced registration goes back to the cash payment.

No account gets the judge role for now. Registration search would still admit
a judge, so reopen #262 before creating one.

## Listas de respaldo y contingencia en papel

The lists (#65) need an event administrator; judges get no data. See the
[attendee lists contract](../contracts/attendee-lists.md).

### Before the event

1. Open "Listas de respaldo" from the side navigation ("Operación"). The page
   reads one snapshot: press "Actualizar" for a fresh one.
2. In "Lista", choose "Todas las listas" or one list: "Evento completo", one
   per pass ("Pase · …") and one per competition or workshop. Press "Imprimir
   o guardar PDF" and print or save each one. Each list starts on a new page.
3. Every printed page shows the event, the list and "Generada el …". Note
   that time: a list does not show anything that changed after it. Lists
   include confirmed and pending-payment registrations with their status;
   voided ones are left out. They carry no contact data.
4. The empty "Marca" column is for handwritten attendance during an outage.

Only the main studio has a guaranteed printer, so print or save the PDFs
there ahead of time. How copies are distributed across venues and who owns the
paper on each shift are still open decisions; record the owner and the time
they take over on the day.

### During an outage

1. Use the printed lists: check people against them and write in "Marca".
2. Any administrator may take cash from a new person: hand over the numbered
   receipt in duplicate (the copy goes to the person, the original stays with
   the team), write a temporary paper entry and grant provisional access. The
   entry's fields are not an organizer decision yet; we suggest name, AKA,
   pass, receipt number, amount, time and administrator.
3. Record other incidents on paper. Nothing on paper changes the platform: no
   registration, payment or check-in exists until it is entered after
   recovery.

### After recovery

Work through the paper one case at a time, connected, with the normal
screens. There is no automatic sync or bulk replay.

- [ ] Check each paper case against the current state in "Buscar
      inscripción" (name, AKA, folio or receipt number).
- [ ] Look for possible duplicates before creating anything; the sale shows
      "¿Es la misma persona?" when it finds matches.
- [ ] Register each new cash person with "Venta en el lugar" and write the
      paper receipt number in "Número de recibo", so the cash record is linked
      to it.
- [ ] Record the check-ins marked on paper on the check-in screen.
- [ ] Escalate every ambiguous case (unclear person, receipt, amount or
      access) to main coordination instead of writing it.

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
replay. Paper may keep the event moving (see "Listas de respaldo y contingencia
en papel"), but does not authorize a platform write when connectivity, scope,
status, or audit is uncertain.

## Registration correction boundary

Only event-authorized administrators, not judges, may perform bounded audited
name/AKA corrections after confirming shared cross-event identity impact;
equal-price Breaking/Popping/Locking/Dancehall swaps of a single full pass
before entry check-in; or justified pending voids. All event-scoped administrators may use those bounded corrections and
read their event's operation history ("Historial", step 12), never judges.
The amount or receipt number of a confirmed cash payment may be
corrected after checking the original paper receipt, with a reason; the
original confirmation and the previous values stay in the audit (step 11).
Cash on the wrong registration, cash recorded without money and a missing or
disputed receipt are not corrected in the platform. Escalate paid cases requiring reversal to the principal organizer
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
