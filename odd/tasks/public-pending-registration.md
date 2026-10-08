# Public pending registration — issue #174

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/174 (source of truth for scope and acceptance criteria)
- Plan: `docs/product/november-2026-online-purchase-plan.md`
- Design: https://claude.ai/artifact/3YcyJrmcNummhmW4DijMGW (buyer flow, mobile-first)
- Engram mirror: `odd/public-pending-registration/tasks`
- Base: `dev` at `6f5962c` (#175 merged)
- Delivery strategy: `auto-chain`, stacked to `dev`; one PR per slice (~400 authored lines), `Refs #174`, `Closes #174` on the last PR, no `Co-Authored-By`.
- History: semi-linear. Granular conventional commits per PR; rebase onto `origin/dev` before merging with a merge commit.
- Review: `gentle-ai review assess --base-ref <last reviewed boundary> --committed-only` per work-unit commit; first boundary `6f5962c`. Review consent is granted without asking when RDD says a review is due on a newly finished task (user instruction).

## Objective

Let a buyer without an account create one `pending_payment` registration for themselves, with passes and optional competition selections, ready to be paid online (#177).

## Decisions

- D1 (user, 2026-10-08) — "A full pass includes general entry" applies everywhere: neither the public flow nor the admin can combine general entry with a full pass. The old admin e2e that expects the combination changes.
- D2 (user, 2026-10-08) — The registration folio is random, not consecutive, with a per-event prefix (for example `LMP-7K3Q`), and unique across the whole system. It is generated once, when the registration becomes `confirmed` (cash or online), and never edited. It is distinct from the paper cash-receipt folio.
- D3 (technical default) — Folio alphabet excludes look-alike characters (no `0`, `O`, `1`, `I`, `L`); collisions retry inside the transaction; a global unique index backs it.
- D4 (technical default) — Non-admin audit uses an explicit actor kind (`admin`, `public`, `system`); admin rows keep a required user and session, public/system rows have none. No names, emails, payment instruments or provider payloads are stored.
- D5 (technical default) — A buyer with a `confirmed` registration in the event (matched by normalized email or phone) is rejected with a neutral message. An existing `pending_payment` registration from the same buyer is reused and its passes and selections are replaced by the new request. `voided` registrations do not block.
- D6 (technical default) — Legal acceptance storage is left to #180; this issue documents the hook point only.

## Current state (exploration, 2026-10-08)

- `participants` (`apps/backend/src/database/schema/participants.ts:4-23`): `full_name`, nullable `email`/`phone`, `stage_name`; global, no uniqueness; none of the #58 split fields.
- `event_registrations` (`schema/registrations.ts:16-58`): status/confirmation checks; unique `(event_id, participant_id)` and `(event_id, folio)`; folio never written.
- Admin manual registration (`manual-registration.service.ts:26-95`) creates participant + registration + audit under a per-event advisory lock and hard-blocks duplicates by trimmed phone / lowercased email over all statuses; no passes.
- Passes and selections come from `RegistrationEntitlementsService` (`registration-entitlements.service.ts:104-266`): `pending_payment` only, Open Styles rule, price snapshot, selectable checks; helpers are private and take an admin actor.
- General entry + full pass is not enforced; `test/admin-registration-entitlements.e2e-spec.ts:182` expects success.
- `registration_operation_audit` (`schema/registration-operation-audit.ts:9-58`): NOT NULL `actor_user_id` and `session_id` FKs, operation check (4 admin types), `amount_ck` tied to `cash_confirmation`, immutability trigger; only e2e specs read it. Policy: `docs/contracts/admin-registration-audit-policy.md`.
- Only `ManualRegistrationService.confirm` (`:97-154`) sets `confirmed`.
- Public side from #175: `PublicCatalogService.requireOpen(slug, now)`, `@PublicRateLimit()`, public CORS.

## Constraints

- Backend: NestJS + Drizzle; hand-written migrations (next `0015`); e2e with disposable PostgreSQL (Docker).
- Test-first where a deterministic RED is observable. About 400 authored lines per slice is a planning heuristic, not a cap.

## Slices and tasks

Forecast: ~1,800–2,200 authored lines over 4 PRs.

### PR 1 — `feat/174-01-participant-profile`

- [x] T1 — Participant fields per #58 (first name, first last name, second last name, city, Instagram, level, birth date; AKA stays `stage_name`; `full_name` kept consistent), shared email/phone normalization, and the D1 rule in the entitlements service with the old admin e2e updated. Contract docs. Specs.

### PR 2 — `feat/174-02-non-admin-audit`

- [ ] T2 — Audit actor kind (D4), new operation types `online_registration` and `payment_approval` (amount rule revisited), policy doc. Specs.

### PR 3 — `feat/174-03-registration-folio`

- [ ] T3 — Random per-event-prefix folio (D2, D3) generated in a shared confirmation helper used by cash confirmation now and by #177 later; global unique index; backfill of existing confirmed registrations. Specs.

### PR 4 — `feat/174-04-public-registration-api`

- [ ] T4 — `POST /public/events/:slug/registrations`: sales open, rate limited, field-level validation (#58 fields, email required), D1 and Open Styles rules, D5 duplicates (phone matching must treat `+52 55…` and `55…` as the same Mexican number; T1's `normalizePhone` keeps the country code), one transaction for participant, registration, passes, selections and public audit; response for the purchase screens. Contract doc. Jest + PostgreSQL e2e.

## Acceptance criteria

See issue #174. Evidence is recorded per task below.

## Progress

- 2026-10-08 — D1 and D2 answered. Exploration done (delegated read-only explorer). Feature doc created. Next: T1.
- 2026-10-08 — T1 implemented on `feat/174-01-participant-profile` (not yet committed): migration `0015_participant_profile` with nullable #58 columns and immutable checks (`level` free text ≤ 50, no country), pure normalization in `src/events/participant-profile/`, D1 as the pure `pass-class-rules.ts` check used by `addPass` (409 `A full pass already includes general entry`), admin e2e updated, contracts updated. RED observed for the unit specs (missing modules) and the new D1 e2e before the service change.

## Route per task

- T1 — delegated writer (writer trigger: migration, schema, normalization, entitlements rule, specs, contracts). Files: `drizzle/0015_participant_profile.sql`, journal, `schema/participants.ts`, `events/participant-profile/*`, `events/registration-entitlements/pass-class-rules*`, entitlements service, manual-registration controller (reuses `normalizeEmail`, same behaviour), three e2e specs, two contracts.
