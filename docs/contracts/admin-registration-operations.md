# Admin registration operations scope

This is a design and follow-up issue decomposition contract for GitHub issue #63, not an implementation of APIs, UI, payment handling, or audit storage. The [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) remains **DRAFT pending organizer validation**; its admin-panel examples are proposed direction, not approved product scope.

## Existing seams and minimum boundary

- Events, attached venues, and neutral activities have a [persistence foundation](event-activity-foundation.md) and a [read-only admin foundation view](event-activity-api-boundary.md). Registration operations must stay within the requested event, including activity enrollment.
- Participants currently have name, optional email and stage name; event registrations carry a registration folio once confirmed (see **Registration folio** below); activity registrations link an event registration to activities in that event. #58 has separately settled the private registration inputs: required first name, first last name, email and phone; optional second last name, AKA, country, city, Instagram, level and birth date. Since migration `0015_participant_profile`, `participants` also stores the optional #58 profile columns `first_name`, `first_last_name`, `second_last_name`, `city`, `instagram`, `level` (free text; #58 defines no closed set) and `birth_date`; AKA stays `stage_name` and `full_name` stays the required display name, built from the parts when they are given (`participant-profile/participant-normalization.ts`). Text values must be non-blank and bounded when present, and the first name and first last name are recorded together. Country is not stored: online payments are Mexico-only for the MVP (#174). Admin manual registration accepts the same fields with the same validation and normalization as public registration (#125).
- Event registrations default to `pending_payment`. `confirmed` requires an explicit confirmation source (`approved_payment`, `admin_cash` or, since #263, `admin_complimentary`) and confirmation timestamp; `voided` is not valid for attendance. Persistence constraints enforce row consistency, **not** actor authority or transition history. A client payment redirect is never sufficient to confirm a registration.
- The [admin authentication boundary](admin-auth-boundary.md) defines server-side sessions, admin-capable roles, event-scoped authorization, safe denials, and durable **auth** audit. Registration changes need their own authorization policy and durable **operation** audit; auth auditing alone is not enough.

## Proposed operations

- **Search/read roster:** Search participants and their event/activity registrations by name, email, stage name, event-scoped folio, or the receipt number of the registration's cash confirmation (#125); read only records in the authorized event. Define match, pagination, and data-minimization details in the search slice; no cross-event directory or exports.
- **Manual registration:** Find or create a participant and create an event registration, with optional same-event activity registrations, initially `pending_payment`. Apply the settled #58 private inputs; possible duplicates on email or phone require explicit admin confirmation rather than an automatic block (mechanics in **Manual registration and cash receipt (#125)** below). Do not infer payment from creation.
- **Cash confirmation:** An authorized operator explicitly records an in-person cash decision against an event registration and transitions it to `confirmed` with source `admin_cash` and confirmation timestamp. This may follow manual registration or apply to an existing pending registration. The original confirmation records the amount received, the paper receipt number (required since #125), authenticated actor, and system timestamp (#58, delivered in #103). No automatic confirmation from a browser redirect; no payment-provider settlement, reconciliation, or refund. Additional evidence for a later disputed or mistaken cash correction belongs to #104 and remains to be defined.
- **Registration folio** (#174, migration `0017_registration_folio`): every confirmed registration has a folio `<PREFIX>-<CODE>`, for example `LMP-7K3Q`. The prefix belongs to the event (`events.folio_prefix`, an uppercase letter followed by 1–5 uppercase letters or digits; `EV` by default and for events created before 0017; the November catalog seed sets `LMP`). The code is four random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0`, `O`, `1`, `I`, `L`), not a sequence. Folios are unique across the whole system (`event_registrations_folio_uq`, which replaced the per-event constraint). The folio is assigned once, in the same transaction that moves a registration from `pending_payment` to `confirmed` (`registration-confirmation/confirm-registration.ts`, used by cash and complimentary confirmations and by approved online payments in #177); a collision retries with a new code under a savepoint, up to five attempts. A `pending_payment` registration has no folio, a `confirmed` one always has one, and a `voided` registration keeps the folio it had (`event_registrations_folio_status_ck`). A trigger rejects any change or removal of an assigned folio and, as a backstop for writes outside the application, assigns one to a confirmation written without it. Confirmed registrations from before 0017 were backfilled. The cash and complimentary confirmation responses and their audit `after_state` include the folio. The registration folio is not the paper cash-receipt folio, which stays in the audit `receipt` field.
- **Controlled correction/voiding:** Only event-authorized administrators (not judges) may make bounded, reasoned and audited name/AKA corrections after shared cross-event identity confirmation; equal-price discipline swaps among Breaking, Popping, Locking and Dancehall; or justified pending voids. A separate bounded cash-correction case is approved in principle, requiring coordination staff verification, reason, minimum evidence and preserved original confirmation/payment facts; its command-specific allowed transitions and guards remain blockers. Paid cases requiring reversal escalate to the principal organizer outside automated MVP correction; no Mercado Pago edits or refunds. Exclude transfers, general-to-participant upgrades and folio edits. Define enforceable safeguards before commands ship.
- **Pass assignment rule:** A full pass includes general entry (#174, decision D1). Neither the admin nor the public flow may combine a `general` pass with a `full` pass on one registration; the API rejects either order with 409 `A full pass already includes general entry`. See the [event catalog contract](event-catalog.md).

## Manual registration and cash receipt (#125)

Decided on 2026-10-16 (see issue #125).

**Manual registration** — `POST /admin/events/:eventId/registrations/manual`, event administrators only.

- Body fields: required `firstName`, `firstLastName`, `email` (valid format) and `phone` (10 to 15 digits); optional `secondLastName`, `stageName` (AKA), `city`, `instagram`, `level` and `birthDate` (`YYYY-MM-DD`, not in the future); optional `activityIds` (unique same-event activity UUIDs, at most 100); optional `confirmedDuplicateRegistrationIds` (unique UUIDs, at most 100). Validation and normalization are the public registration rules (`parseParticipantFields` in `public-registration/public-registration-request.ts`); `full_name` is built from the name parts. Country is not stored.
- An invalid body answers 400 `{ "statusCode": 400, "message": "Invalid manual registration", "fieldErrors": { "<field>": "<code>" } }` with the public registration codes (`required`, `invalid`, `too_long`, `in_future`, `unknown_field`); `activityIds` and `confirmedDuplicateRegistrationIds` report `invalid`. An activity outside the event answers 400 `Invalid activity`.
- Possible duplicates are registrations **of the same event** that are not `voided`, whose participant has the same email (lowercased and trimmed) or the same phone match key that public registration uses (`phoneMatchKey` / `phoneMatchKeySql`). Expired online registrations of the event are voided first, as in public registration, so they never count.
- When a possible duplicate is not listed in `confirmedDuplicateRegistrationIds`, the request writes nothing and answers 409:

  ```json
  {
    "statusCode": 409,
    "message": "Possible duplicate registrations need confirmation",
    "code": "possible_duplicates",
    "matches": [
      {
        "registrationId": "…",
        "fullName": "Alex Rivera",
        "stageName": "Flash",
        "folio": null,
        "status": "pending_payment",
        "maskedEmail": "a***@example.com",
        "maskedPhone": "******4567"
      }
    ]
  }
  ```

  The masked email keeps the first character of the local part and the whole domain; the masked phone shows only the last four digits, every other digit as `*`. A participant without email or phone shows `null`. Only an administrator of that event can receive this answer.

- To continue, the client resends the same body with `confirmedDuplicateRegistrationIds` listing the matches. The server checks the matches again inside the write transaction, under the per-event lock; a match that appeared since the preview and is not in the list answers the same 409 with the current matches. On success the registration is created as before (a new participant, `pending_payment`), and the `manual_registration` audit fact records the confirmed ids in `facts.possibleDuplicatesConfirmed` (empty when there were no matches). Linking the new registration to an existing participant is not part of this flow.

**Cash confirmation** — `POST /admin/events/:eventId/registrations/:registrationId/cash-confirmation`.

- `receipt` is required: trimmed, 1 to 50 characters. Missing, blank, non-text or longer values answer 400 `Receipt number is required and must be 1 to 50 characters`.
- The receipt number is unique among the cash confirmations of the event, compared exactly after trimming (case-sensitive: `A-17` and `a-17` differ). A repeated number answers 409 `{ "statusCode": 409, "message": "Receipt number already used in this event", "code": "receipt_taken" }` and writes nothing. The database enforces it with the partial unique index `registration_operation_audit_cash_receipt_uq` on `(event_id, receipt)` for `cash_confirmation` rows with a receipt (migration `0029_cash_receipt_unique`), so concurrent requests are safe. Another event may use the same number.
- Earlier cash confirmations without a receipt stay as legacy rows; the column stays nullable and no number is invented for them.
- A successful cash confirmation queues the participant's confirmation email in the same transaction and tries to send it after commit; a send failure never changes the answer, and the sweep retries it (#263, [confirmation email contract](confirmation-email.md)).

## Confirmation without payment (#263)

`POST /admin/events/:eventId/registrations/:registrationId/complimentary-confirmation` with `{ "reason": "Golden ticket, winner of X" }`. It confirms, in person, a registration whose passes are free (golden tickets and guests). It has the same guard as cash: an active event-administrator session (not a judge), a trusted `Origin` and the session CSRF token.

- `reason` is required: trimmed, 1 to 500 characters. Missing, blank, non-text or longer values answer 400 `Reason is required and must be 1 to 500 characters`.
- The registration must be `pending_payment` in the event; otherwise 400 `Registration is not pending in this event`, as cash.
- It must hold at least one pass, and the sum of its pass price snapshots (`event_registration_passes.price_cents`, taken when each pass was held) must be exactly 0. The current pass-type price does not count. Otherwise 409, writing nothing:
  - no passes: `{ "statusCode": 409, "message": "Registration holds no passes", "code": "no_passes" }`;
  - a non-zero total: `{ "statusCode": 409, "message": "Registration passes do not total zero", "code": "not_zero_total" }`.
- The check locks the registration row, as pass changes do, so a pass added concurrently cannot slip in between the check and the confirmation.
- In one transaction it confirms with source `admin_complimentary` and assigns the folio, appends a `complimentary_confirmation` audit fact (the reason in `note`, `amount_cents`, `reference` and `receipt` null; see the [audit policy](admin-registration-audit-policy.md)) and queues the confirmation email. The email is tried after commit, as for cash; a send failure never changes the answer.
- 201 answers the same shape as cash: `{ "registrationId", "eventId", "status": "confirmed", "folio", "auditId" }`.

## Permissions and audit invariants

- Every read or write requires an active server-side session and authorization for the requested event. The existing auth boundary calls `admin` and `judge` admin-capable, but registration operations here require an **administrator, not a judge**, with operation-specific event authority. Denials must not expose inaccessible event or participant data. All event-scoped administrators may use bounded corrections and read operation history for their authorized event, never judges; define the event-scope/access mechanics and enforce staff verification and command-specific guards for cash corrections server-side before release. Do not add general role administration here.
- Every material registration operation (creation, cash confirmation, correction, voiding) must durably record **actor identity, event id, registration id, operation type, timestamp, and before/after values or a reason where applicable**. A correction or void must retain enough prior state and reason to explain what changed; a cash confirmation must retain attribution and confirmation-source change. Define event-scoped history access mechanics and retention before release.
- Persist the registration change and corresponding operation audit atomically; report success only after both durable writes succeed. A failed audit write must not leave a successful unlogged change. Reject unauthorized, out-of-event, invalid, or duplicate transitions without reporting success. The existing lifecycle constraints are a backstop, not a substitute for transition checks and audit.

The [issue #101 operation audit and correction policy](admin-registration-audit-policy.md) specifies the proposed fact shape, conservative transition boundaries, and decisions blocking write commands; it does not implement audit storage or approve organizer policy.

## Organizer decisions required before implementation

- #58 settled the private inputs and the explicit admin confirmation of possible email/phone duplicates; #125 settled how they are matched, presented and confirmed (see above).
- Define operation-specific guards for creation and original cash recording. Bounded correction and pending void authority, and event-scoped history readership, belong to all event-scoped administrators; only event-scope/access mechanics remain pending.
- For #104 disputed/mistaken cash corrections, define additional minimum evidence, safe storage, and coordination staff verification mechanics, including whether currency or receipt/comprobante details are needed. The original confirmation's amount received, authenticated actor, and system timestamp are already established by #58/#103; no implied refunds or reconciliation.
- Implementation of agreed bounded correction guards, reason/redaction and shared cross-event identity confirmation, plus event-scoped history access mechanics. Two years of history is desired subject to feasibility and legal review, not a retention guarantee.

## Follow-up implementation issues

1. **[#101 — Define audit facts and correction policy for admin registration changes](https://github.com/KevinBarrera/nuestro-breaking/issues/101)** — [contract](admin-registration-audit-policy.md) defines proposed operation facts, atomic persistence, conservative correction/void boundaries, and explicit organizer blockers; decisions remain required before commands. Depends on the existing registration lifecycle and admin auth boundary.
2. **[#102 — Add event-scoped admin participant search](https://github.com/KevinBarrera/nuestro-breaking/issues/102)** — guarded read-only lookup/roster for the four stored lookup fields, event filtering, safe denials, and bounded responses; no writes, check-in, or exports. Depends on participant persistence and the admin guard; can follow issue #101 in delivery order without depending on its audit storage.
3. **[#103 — Add authorized manual registration and cash-payment recording](https://github.com/KevinBarrera/nuestro-breaking/issues/103)** — delivered the original confirmation boundary: amount received, authenticated actor, and system timestamp for explicit `admin_cash` confirmation; no Mercado Pago, redirects, refunds, or reconciliation. Further evidence and verification for mistaken cash corrections belong to #104.
4. **[#104 — Add audited, authorized correction of registration errors](https://github.com/KevinBarrera/nuestro-breaking/issues/104)** — administrator-only bounded correction and pending void commands with retained prior state and reasons; no general-purpose editing, paid-case automation, or refund flow. Depends on #101, #103, and the remaining command-specific transition, evidence and guard decisions; correction authority is settled.
5. **[#105 — Add admin registration operations UI](https://github.com/KevinBarrera/nuestro-breaking/issues/105)** — event-scoped lookup and guarded manual registration, cash, and correction screens consuming the implemented commands; no client-side authority, check-in, or list download. Depends on #102–#104; surface denials and recorded outcomes without claiming success before durable writes. The in-person sale screens (search, manual registration, passes, competitions and cash) are described in the [frontend architecture](../frontend-architecture.md); correction and voiding screens moved to #256.

## Explicit exclusions

This contract does not cover public registration; Mercado Pago or other payment-provider editing; payment reconciliation or refunds; check-in or attendance; printable browser lists or PDF (no CSV/Excel MVP list); offline platform writes, automatic synchronization or blind replay of paper notes; full user/role administration; organizer-specific event/activity product rules; or legal/tax claims. The [event-day runbook](../runbooks/event-day.md) describes only a paper contingency with later manual duplicate review and reconciliation.

## Cross-references

- [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) — DRAFT pending organizer validation
- [Admin authentication boundary](admin-auth-boundary.md)
- [Event/activity foundation](event-activity-foundation.md)
- [Event/activity API boundary](event-activity-api-boundary.md)
- [Issue #61 registration lifecycle task](../../odd/tasks/registration-lifecycle-states.md) and [issue #62 participant model task](../../odd/tasks/participant-registration-model.md)
