# Admin registration operations scope

This is a design and follow-up issue decomposition contract for GitHub issue #63, not an implementation of APIs, UI, payment handling, or audit storage. The [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) remains **DRAFT pending organizer validation**; its admin-panel examples are proposed direction, not approved product scope.

## Existing seams and minimum boundary

- Events, attached venues, and neutral activities have a [persistence foundation](event-activity-foundation.md) and a [read-only admin foundation view](event-activity-api-boundary.md). Registration operations must stay within the requested event, including activity enrollment.
- Participants currently have name, optional email and stage name; event registrations carry an optional event-scoped folio; activity registrations link an event registration to activities in that event. #58 has separately settled the private registration inputs: required first name, first last name, email and phone; optional second last name, AKA, country, city, Instagram, level and birth date. Existing persistence does not yet enforce those inputs or provide an admin workflow.
- Event registrations default to `pending_payment`. `confirmed` requires an explicit confirmation source (`approved_payment` or `admin_cash`) and confirmation timestamp; `voided` is not valid for attendance. Persistence constraints enforce row consistency, **not** actor authority or transition history. A client payment redirect is never sufficient to confirm a registration.
- The [admin authentication boundary](admin-auth-boundary.md) defines server-side sessions, admin-capable roles, event-scoped authorization, safe denials, and durable **auth** audit. Registration changes need their own authorization policy and durable **operation** audit; auth auditing alone is not enough.

## Proposed operations

- **Search/read roster:** Search participants and their event/activity registrations by name, email, stage name, or event-scoped folio; read only records in the authorized event. Define match, pagination, and data-minimization details in the search slice; no cross-event directory or exports.
- **Manual registration:** Find or create a participant and create an event registration, with optional same-event activity registrations, initially `pending_payment`. Apply the settled #58 private inputs; possible duplicates on email or phone require explicit admin confirmation rather than an automatic block. Define matching and confirmation mechanics before implementation; do not infer payment from creation.
- **Cash confirmation:** An authorized operator explicitly records an in-person cash decision against an event registration and transitions it to `confirmed` with source `admin_cash` and confirmation timestamp. This may follow manual registration or apply to an existing pending registration. The original confirmation records the amount received, authenticated actor, and system timestamp (#58, delivered in #103). No automatic confirmation from a browser redirect; no payment-provider settlement, reconciliation, or refund. Additional evidence for a later disputed or mistaken cash correction belongs to #104 and remains to be defined.
- **Controlled correction/voiding:** Only event-authorized administrators (not judges) may make bounded, reasoned and audited name/AKA corrections after shared cross-event identity confirmation; equal-price discipline swaps among Breaking, Popping, Locking and Dancehall; or justified pending voids. A separate bounded cash-correction case is approved in principle, requiring coordination staff verification, reason, minimum evidence and preserved original confirmation/payment facts; its command-specific allowed transitions and guards remain blockers. Paid cases requiring reversal escalate to the principal organizer outside automated MVP correction; no Mercado Pago edits or refunds. Exclude transfers, general-to-participant upgrades and folio edits. Define enforceable safeguards before commands ship.

## Permissions and audit invariants

- Every read or write requires an active server-side session and authorization for the requested event. The existing auth boundary calls `admin` and `judge` admin-capable, but registration operations here require an **administrator, not a judge**, with operation-specific event authority. Denials must not expose inaccessible event or participant data. All event-scoped administrators may use bounded corrections and read operation history for their authorized event, never judges; define the event-scope/access mechanics and enforce staff verification and command-specific guards for cash corrections server-side before release. Do not add general role administration here.
- Every material registration operation (creation, cash confirmation, correction, voiding) must durably record **actor identity, event id, registration id, operation type, timestamp, and before/after values or a reason where applicable**. A correction or void must retain enough prior state and reason to explain what changed; a cash confirmation must retain attribution and confirmation-source change. Define event-scoped history access mechanics and retention before release.
- Persist the registration change and corresponding operation audit atomically; report success only after both durable writes succeed. A failed audit write must not leave a successful unlogged change. Reject unauthorized, out-of-event, invalid, or duplicate transitions without reporting success. The existing lifecycle constraints are a backstop, not a substitute for transition checks and audit.

The [issue #101 operation audit and correction policy](admin-registration-audit-policy.md) specifies the proposed fact shape, conservative transition boundaries, and decisions blocking write commands; it does not implement audit storage or approve organizer policy.

## Organizer decisions required before implementation

- #58 has settled private required and optional inputs and the explicit admin confirmation (not automatic blocking) of possible email/phone duplicates. Define how to enforce the inputs and present, match, and confirm possible duplicates in the admin workflow; do not reopen the field or duplicate policy.
- Define operation-specific guards for creation and original cash recording. Bounded correction and pending void authority, and event-scoped history readership, belong to all event-scoped administrators; only event-scope/access mechanics remain pending.
- For #104 disputed/mistaken cash corrections, define additional minimum evidence, safe storage, and coordination staff verification mechanics, including whether currency or receipt/comprobante details are needed. The original confirmation's amount received, authenticated actor, and system timestamp are already established by #58/#103; no implied refunds or reconciliation.
- Implementation of agreed bounded correction guards, reason/redaction and shared cross-event identity confirmation, plus event-scoped history access mechanics. Two years of history is desired subject to feasibility and legal review, not a retention guarantee.

## Follow-up implementation issues

1. **[#101 — Define audit facts and correction policy for admin registration changes](https://github.com/KevinBarrera/nuestro-breaking/issues/101)** — [contract](admin-registration-audit-policy.md) defines proposed operation facts, atomic persistence, conservative correction/void boundaries, and explicit organizer blockers; decisions remain required before commands. Depends on the existing registration lifecycle and admin auth boundary.
2. **[#102 — Add event-scoped admin participant search](https://github.com/KevinBarrera/nuestro-breaking/issues/102)** — guarded read-only lookup/roster for the four stored lookup fields, event filtering, safe denials, and bounded responses; no writes, check-in, or exports. Depends on participant persistence and the admin guard; can follow issue #101 in delivery order without depending on its audit storage.
3. **[#103 — Add authorized manual registration and cash-payment recording](https://github.com/KevinBarrera/nuestro-breaking/issues/103)** — delivered the original confirmation boundary: amount received, authenticated actor, and system timestamp for explicit `admin_cash` confirmation; no Mercado Pago, redirects, refunds, or reconciliation. Further evidence and verification for mistaken cash corrections belong to #104.
4. **[#104 — Add audited, authorized correction of registration errors](https://github.com/KevinBarrera/nuestro-breaking/issues/104)** — administrator-only bounded correction and pending void commands with retained prior state and reasons; no general-purpose editing, paid-case automation, or refund flow. Depends on #101, #103, and the remaining command-specific transition, evidence and guard decisions; correction authority is settled.
5. **[#105 — Add admin registration operations UI](https://github.com/KevinBarrera/nuestro-breaking/issues/105)** — event-scoped lookup and guarded manual registration, cash, and correction screens consuming the implemented commands; no client-side authority, check-in, or list download. Depends on #102–#104; surface denials and recorded outcomes without claiming success before durable writes.

## Explicit exclusions

This contract does not cover public registration; Mercado Pago or other payment-provider editing; payment reconciliation or refunds; check-in or attendance; printable browser lists or PDF (no CSV/Excel MVP list); offline platform writes, automatic synchronization or blind replay of paper notes; full user/role administration; organizer-specific event/activity product rules; or legal/tax claims. The [event-day runbook](../runbooks/event-day.md) describes only a paper contingency with later manual duplicate review and reconciliation.

## Cross-references

- [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) — DRAFT pending organizer validation
- [Admin authentication boundary](admin-auth-boundary.md)
- [Event/activity foundation](event-activity-foundation.md)
- [Event/activity API boundary](event-activity-api-boundary.md)
- [Issue #61 registration lifecycle task](../../odd/tasks/registration-lifecycle-states.md) and [issue #62 participant model task](../../odd/tasks/participant-registration-model.md)
