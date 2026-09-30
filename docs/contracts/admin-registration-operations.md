# Admin registration operations scope

This is a design and follow-up issue decomposition contract for GitHub issue #63, not an implementation of APIs, UI, payment handling, or audit storage. The [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) remains **DRAFT pending organizer validation**; its admin-panel examples are proposed direction, not approved product scope.

## Existing seams and minimum boundary

- Events, attached venues, and neutral activities have a [persistence foundation](event-activity-foundation.md) and a [read-only admin foundation view](event-activity-api-boundary.md). Registration operations must stay within the requested event, including activity enrollment.
- Participants have name, optional email and stage name; event registrations carry an optional event-scoped folio; activity registrations link an event registration to activities in that event. These records support future lookup but do not provide an admin workflow today.
- Event registrations default to `pending_payment`. `confirmed` requires an explicit confirmation source (`approved_payment` or `admin_cash`) and confirmation timestamp; `voided` is not valid for attendance. Persistence constraints enforce row consistency, **not** actor authority or transition history. A client payment redirect is never sufficient to confirm a registration.
- The [admin authentication boundary](admin-auth-boundary.md) defines server-side sessions, admin-capable roles, event-scoped authorization, safe denials, and durable **auth** audit. Registration changes need their own authorization policy and durable **operation** audit; auth auditing alone is not enough.

## Proposed operations

- **Search/read roster:** Search participants and their event/activity registrations by name, email, stage name, or event-scoped folio; read only records in the authorized event. Define match, pagination, and data-minimization details in the search slice; no cross-event directory or exports.
- **Manual registration:** Find or create a participant and create an event registration, with optional same-event activity registrations, initially `pending_payment`. Resolve duplicates and organizer-required fields before implementation; do not infer payment from creation.
- **Cash confirmation:** An authorized operator explicitly records an in-person cash decision against an event registration and transitions it to `confirmed` with source `admin_cash` and confirmation timestamp. This may follow manual registration or apply to an existing pending registration. No automatic confirmation from a browser redirect; no payment-provider settlement, reconciliation, or refund. Define cash amount and receipt expectations with organizers first.
- **Controlled correction/voiding:** An authorized operator corrects allowed registration/participant/activity details or voids an erroneous registration, retaining prior facts and a reason according to the correction policy. Do not silently overwrite confirmation or invent reversal/refund semantics; permitted fields, transitions, and reason requirements must be settled before commands ship.

## Permissions and audit invariants

- Every read or write requires an active server-side session, an admin-capable role (`admin` or `judge` in the existing auth boundary), and authorization for the requested event. Denials must not expose inaccessible event or participant data. Being admin-capable is **not** by itself permission to take cash or correct records: the organizer must decide which authorized staff may perform each operation, and the write guard must enforce that policy server-side before release. Do not add general role administration here.
- Every material registration operation (creation, cash confirmation, correction, voiding) must durably record **actor identity, event id, registration id, operation type, timestamp, and before/after values or a reason where applicable**. A correction or void must retain enough prior state and reason to explain what changed; a cash confirmation must retain attribution and confirmation-source change. Define audit access and retention before release.
- Persist the registration change and corresponding operation audit atomically; report success only after both durable writes succeed. A failed audit write must not leave a successful unlogged change. Reject unauthorized, out-of-event, invalid, or duplicate transitions without reporting success. The existing lifecycle constraints are a backstop, not a substitute for transition checks and audit.

The [issue #101 operation audit and correction policy](admin-registration-audit-policy.md) specifies the proposed fact shape, conservative transition boundaries, and decisions blocking write commands; it does not implement audit storage or approve organizer policy.

## Organizer decisions required before implementation

- Required participant fields and how to handle possible duplicate people or registrations.
- Which event-authorized staff may create registrations, record cash, and correct or void errors; whether these permissions differ.
- Cash amount and receipt/comprobante expectations, including how to handle disputed or mistaken cash entries without implying refunds or reconciliation.
- Permitted correction fields and status transitions, when a reason is mandatory, and who may inspect operation history and for how long it is retained.

## Follow-up implementation issues

1. **[#101 — Define audit facts and correction policy for admin registration changes](https://github.com/KevinBarrera/nuestro-breaking/issues/101)** — [contract](admin-registration-audit-policy.md) defines proposed operation facts, atomic persistence, conservative correction/void boundaries, and explicit organizer blockers; decisions remain required before commands. Depends on the existing registration lifecycle and admin auth boundary.
2. **[#102 — Add event-scoped admin participant search](https://github.com/KevinBarrera/nuestro-breaking/issues/102)** — guarded read-only lookup/roster for the four stored lookup fields, event filtering, safe denials, and bounded responses; no writes, check-in, or exports. Depends on participant persistence and the admin guard; can follow issue #101 in delivery order without depending on its audit storage.
3. **[#103 — Add authorized manual registration and cash-payment recording](https://github.com/KevinBarrera/nuestro-breaking/issues/103)** — guarded commands to create participant/event/activity enrollment and explicitly confirm pending registrations via `admin_cash`, with atomic operation audit and safe transition/duplicate handling; no Mercado Pago, redirects, refunds, or reconciliation. Depends on #101, #102, and organizer decisions about fields, cash authority, and receipts.
4. **[#104 — Add audited, authorized correction of registration errors](https://github.com/KevinBarrera/nuestro-breaking/issues/104)** — guarded, policy-limited correction and void commands with retained prior state and reasons; no general-purpose editing or refund flow. Depends on #101, #103, and organizer decisions about correction authority and permitted changes.
5. **[#105 — Add admin registration operations UI](https://github.com/KevinBarrera/nuestro-breaking/issues/105)** — event-scoped lookup and guarded manual registration, cash, and correction screens consuming the implemented commands; no client-side authority, check-in, or list download. Depends on #102–#104; surface denials and recorded outcomes without claiming success before durable writes.

## Explicit exclusions

This contract does not cover public registration; Mercado Pago or other payment-provider integration; payment reconciliation or refunds; check-in or attendance; printable/downloadable lists or exports; offline operation or synchronization; full user/role administration; organizer-specific event/activity product rules; or legal/tax claims.

## Cross-references

- [November 2026 MVP proposal](../product/november-2026-mvp-proposal.md) — DRAFT pending organizer validation
- [Admin authentication boundary](admin-auth-boundary.md)
- [Event/activity foundation](event-activity-foundation.md)
- [Event/activity API boundary](event-activity-api-boundary.md)
- [Issue #61 registration lifecycle task](../../odd/tasks/registration-lifecycle-states.md) and [issue #62 participant model task](../../odd/tasks/participant-registration-model.md)
