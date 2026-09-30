# Admin registration operation audit and correction policy (#101)

This is a design contract for future admin registration writes under [issue #63](admin-registration-operations.md), not implemented storage or permission to ship commands. The November 2026 MVP proposal remains **DRAFT pending organizer validation**.

## Current persistence vs proposed behavior

- #62 stores participant identity (name, optional email/stage name), event registrations (optional event-scoped folio), and same-event activity registrations. It does not define required fields, search, or writes by admins. Participant identity can be shared across event registrations.
- #61 stores `pending_payment` (default), `confirmed`, and `voided`. A confirmed row requires `approved_payment` or `admin_cash` plus `confirmed_at`; pending and voided rows have neither. These are row constraints, not transition authority, audit history, or payment/refund rules.
- Admin authentication audit concerns sign-in, sessions, and access decisions; it is **not** registration operation audit. Server-side session, role, and event-scope guards are the prerequisite boundary; operation-specific authority is still undecided.
- Everything below is a **proposed requirement for future commands**, not an assertion that audit tables, correction workflows, or cash recording exist.

## Minimum durable operation fact

Each accepted material operation appends a distinct, immutable operation fact. Record a stable operation/fact id; operation type (`manual_registration`, `cash_confirmation`, `registration_correction`, `registration_void`); outcome (`accepted`, or a safe `rejected` decision when an attempted operation is auditable); server timestamp; actor user id and server-side session record reference (never the cookie/token); authorized event id; event registration id; participant id; and the affected same-event activity ids (including added/removed ids where applicable). For creation, allocate the registration/participant ids within the write transaction so the accepted fact identifies created records. Capture a safe reason code plus operator-supplied reason where required; rejected facts must not disclose inaccessible target ids or sensitive inputs.

- `manual_registration`: Before: no event registration; after: new registration id, participant id, selected activity ids, `pending_payment`, null confirmation source/time. Record whether the participant was linked or created; no assertion of payment.
- `cash_confirmation`: Before: pending status and null confirmation metadata; after: `confirmed`, `admin_cash`, server confirmation timestamp. Attribute the explicit cash decision; receipt reference/amount fields are blocked pending organizer policy.
- `registration_correction`: Before/after changed-field allowlist and safe old/new values (or redacted references) for the permitted registration/activity changes; mandatory operator reason. Unchanged status and confirmation metadata must be evident.
- `registration_void`: Before: status, confirmation source/time, participant id and activity ids; after: `voided`, null confirmation source/time per #61 row constraints. Mandatory operator reason; retain the prior confirmation facts in the append-only audit rather than in the voided row.

Safe snapshots are scoped to registration status, confirmation source/time, event/registration/participant/activity references, and the changed allowed registration fields; capture only what explains the decision. Do **not** store names, email, stage name, raw session identifiers/cookies, passwords, payment instruments/provider payloads, free-form customer data, or unredacted receipt images in operation facts. If an organizer-approved correction later needs identity details, define a minimal redacted before/after representation and access policy before enabling it; do not log whole participant rows or request bodies. Treat reasons as sensitive: constrain their content, redact secrets and personal details, and restrict readers. No public projection follows from these facts.

The authoritative registration mutation (including any participant/activity changes) and its required operation fact must commit in the **same database transaction**. Report success only after commit; if audit persistence fails, roll back the entire mutation. No successful unlogged material change. Enforce server-side active session, admin-capable role, event scope, and the **operation-specific** authorization decision before any mutation; reject duplicate, invalid, out-of-event, or unauthorized transitions without success. Audit safe rejection decisions where applicable without leaking protected targets; rejection never creates a successful state change. The [data lifecycle model](../models/data-lifecycle.md) remains the general append-only/redacted and atomic-write boundary; this contract does not alter it.

## Conservative correction and voiding boundary

- Creation is pending only. Cash confirmation is an explicit, one-time pending -> confirmed decision with `admin_cash` and `confirmed_at`; do not accept repeat confirmation, confirmation of voided/confirmed rows, or overwriting an `approved_payment` confirmation.
- Until organizer decisions are recorded, a correction may change only an existing **pending** event registration's optional folio and same-event activity links, with an operator reason and before/after evidence. Keep the same registration and participant ids. Validate folio uniqueness, activity/event integrity, and duplicate enrollment at write time. Do not use correction to change participant identity, registration event, status, confirmation source/time, or payment facts. Edits to shared participant records, even for a pending registration, require a separate agreed cross-event policy.
- Pending -> voided is permitted only as a reasoned error-void by an operator specifically authorized for voiding; prior state stays in audit. `voided` is terminal for these commands: no resurrection, correction, confirmation, or reuse as a refund. A confirmed -> voided transition is **blocked** until organizers decide whether and when it is permitted, including distinct cash vs approved-payment handling and how to preserve the previous confirmation. If eventually allowed, clear confirmation metadata in the row as #61 requires and preserve it in the immutable before snapshot; never silently erase history.
- Reject cross-event changes, duplicate activity links/registrations, arbitrary participant merges or deletes, and attempts to use correction/voiding as payment reversal, refund, or reconciliation. None of these operations changes payment-provider state or creates a receipt/settlement assertion.

## Release blockers requiring organizer/product decisions

Do not ship the relevant write command until its decision and enforceable policy are recorded:

1. **Authority:** which event-authorized operators may create, confirm cash, correct, and void, separately (including whether confirmed void is ever allowed); admin-capable role alone is insufficient. Who may read operation history, at what event scope, must also be decided.
2. **Fields and duplicates:** required participant/registration fields, identity matching and duplicate resolution, and whether/how shared participant identity may be corrected without cross-event leakage.
3. **Cash evidence:** whether amount, currency, receipt/comprobante reference or issuance is required, where sensitive receipts live, and how disputed/mistaken cash decisions are handled without refund/reconciliation semantics.
4. **Corrections and retention:** confirm the pending-only field allowlist, mandatory reason shape/redaction, any approved confirmed-state corrections or voids, and the restricted audit-reader/access and retention policy. No retention duration or compliance guarantee is implied by this contract.

#102 read-only search can proceed independently. #103 manual/cash and #104 correction/void commands must consume this policy and the decisions above before release. Payment-provider work, refunds/reconciliation, check-in, exports, UI, API commands, migrations, and role administration are outside #101.
