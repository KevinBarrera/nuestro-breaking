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

- [x] T2 — Audit actor kind (D4), new operation types `online_registration` and `payment_approval` (amount rule revisited), policy doc. Specs.

### PR 3 — `feat/174-03-registration-folio`

- [x] T3 — Random per-event-prefix folio (D2, D3) generated in a shared confirmation helper used by cash confirmation now and by #177 later; global unique index; backfill of existing confirmed registrations. Specs.

### PR 4 — `feat/174-04-public-registration-api`

- [x] T4 — `POST /public/events/:slug/registrations`: sales open, rate limited, field-level validation (#58 fields, email required), D1 and Open Styles rules, D5 duplicates (phone matching must treat `+52 55…` and `55…` as the same Mexican number; T1's `normalizePhone` keeps the country code), one transaction for participant, registration, passes, selections and public audit; response for the purchase screens. Contract doc. Jest + PostgreSQL e2e.

## Acceptance criteria

See issue #174. Evidence is recorded per task below.

## Progress

- 2026-10-08 — D1 and D2 answered. Exploration done (delegated read-only explorer). Feature doc created. Next: T1.
- 2026-10-08 — T1 implemented on `feat/174-01-participant-profile` (not yet committed): migration `0015_participant_profile` with nullable #58 columns and immutable checks (`level` free text ≤ 50, no country), pure normalization in `src/events/participant-profile/`, D1 as the pure `pass-class-rules.ts` check used by `addPass` (409 `A full pass already includes general entry`), admin e2e updated, contracts updated. RED observed for the unit specs (missing modules) and the new D1 e2e before the service change.
- 2026-10-08 — T1 committed: `d07909f` (participant fields, migration `0015`), `283c988` (normalization), `cc861ff` (D1 rule), docs `6a7b553`. Parent spot check: unit 106/106. Review: medium (413 lines), consent granted per standing instruction, reliability lens approved and acknowledged (lineage `review-3dae1239392b5c67`). Advisory WARNING about concurrent general/full assignment checked by the parent and not acted on: `lockRegistration` takes `FOR UPDATE` on the registration row before reading held passes (`registration-entitlements.service.ts:229-234`), so concurrent `addPass` calls on one registration are serialized and the second sees the first insert. T4 must take the same lock. Next boundary: `cc861ff`. Next: T2.
- 2026-10-08 — T2 implemented on `feat/174-02-non-admin-audit` (not yet committed): migration `0016_non_admin_audit_actor` adds `actor_kind` (`admin`/`public`/`system`, backfilled `admin`, no default kept), nullable `actor_user_id`/`session_id` with a pairing check, operation types `online_registration` and `payment_approval`, and `amount_ck` requiring an amount for both confirmations. Typed `RegistrationAuditActor` union plus `registrationAuditActorColumns` in `src/events/registration-audit/`; admin controllers pass `kind: 'admin'`; the entitlements `audit` helper accepts any actor for T4. Immutability trigger unchanged and re-verified for public facts. RED observed for the unit spec (missing module). Checks: backend lint, unit 110/110, build, e2e 161/161 (19 suites), `pnpm format:check` all passed. Next: T3.
- 2026-10-08 — T2 committed in `5b6bcb2`. Parent spot check: unit 110/110. Review: medium (468 lines), consent granted per standing instruction, reliability lens approved and acknowledged (lineage `review-e690de587db05142`). Advisory only: actor spread order suggestion at `manual-registration.controller.ts:48-49`. Next boundary: `5b6bcb2`. Next: T3.
- 2026-10-08 — T3 implemented on `feat/174-03-registration-folio` (not yet committed): migration `0017_registration_folio` adds `events.folio_prefix` (default `EV`, check `^[A-Z][A-Z0-9]{1,5}$`; seed sets `LMP` only over the default), replaces the per-event folio constraint with system-wide `event_registrations_folio_uq`, backfills confirmed registrations, adds `event_registrations_folio_status_ck` (confirmed ⇒ folio, pending ⇒ none, voided either) and the `event_registrations_folio_guard` trigger (immutable folio; backstop folio for confirmations written without one, which keeps raw-SQL fixtures valid). Pure `generateFolio` (4 chars, `crypto.randomInt`) and shared `confirmRegistration` helper (savepoint per attempt, 5 attempts) in `src/events/registration-confirmation/`; cash confirmation uses it and returns `folio`. RED observed for the unit spec (missing module). `test/admin-registration-search.e2e-spec.ts` (surface extended with user approval) no longer seeds pending rows with folios: the second Alex registration has no folio and the other event's registration is confirmed as `F-12`, still found only inside its own event. Checks: backend lint, unit 115/115, build, e2e 170/170 (20 suites), `pnpm format:check` all passed. Next: commit T3.
- 2026-10-08 — T3 committed in `12b36ea`. Parent spot check: unit 115/115. Review: medium (616 lines), consent granted per standing instruction, reliability lens approved and acknowledged (lineage `review-c456c6fcc835bbbd`). Advisory WARNING accepted without change: migration `0017` fails if legacy data has a folio on a `pending_payment` row or repeats a folio across events (`0017_registration_folio.sql:46`); application code never wrote folios before this task, so only hand-written SQL could produce that, and the migration fails loudly instead of corrupting data. Suggestion left: seed only replaces the `EV` default prefix (`seed-november-catalog.ts:125-129`). Next boundary: `12b36ea`. Next: T4.
- 2026-10-08 — T4 implemented on `feat/174-04-public-registration-api` (not yet committed): `POST /public/events/:slug/registrations` in `src/events/public-registration/` (pure validator with field-path error codes, pure pass rules reusing `combinesGeneralWithFull`, service under the per-event advisory lock with share-locked pass types and activities, D5 duplicates by email or `phoneMatchKey` with a SQL twin, pending reuse under `FOR UPDATE`, one `online_registration` audit fact with actor `public`). `phoneMatchKey` added to the T1 normalization module; the admin `assertSelectable` query moved to the shared `areSelectableActivities` (same admin behaviour). Duplicate pass types are a 400 field error (`duplicate`), not a 409. D6 hook comment in the controller. No migration. Contract `docs/contracts/public-registration.md`, links from the catalog contract and audit policy. RED observed for the unit specs (missing modules and `phoneMatchKey`). Next: commit T4.
- 2026-10-08 — T4 committed: `76860a1` (phone match key), `44bb026` (shared selectable check), `2dac915` (request validation and rules), `adb9802` (public endpoint, e2e, contract). Parent spot check: unit 144/144, build. Review: medium (1,742 lines, about 780 of them tests; kept as one slice because validator, rules and endpoint only make sense together), consent granted per standing instruction, reliability lens approved and acknowledged (lineage `review-0e06e90792c59bf4`). Advisory WARNING accepted and documented as a known risk in `docs/contracts/public-registration.md`: reuse overwrites the pending registration's profile and passes for anyone who knows the buyer's email or phone (`public-registration.service.ts:106-109`). Suggestion left: email-first preference untested (`:261-263`). Follow-up noticed: admin manual registration still compares phones with `btrim`, not `phoneMatchKey`.

## Route per task

- T1 — delegated writer (writer trigger: migration, schema, normalization, entitlements rule, specs, contracts). Files: `drizzle/0015_participant_profile.sql`, journal, `schema/participants.ts`, `events/participant-profile/*`, `events/registration-entitlements/pass-class-rules*`, entitlements service, manual-registration controller (reuses `normalizeEmail`, same behaviour), three e2e specs, two contracts.
- T2 — delegated writer (writer trigger: migration, schema, actor helper, two services, two controllers, e2e specs, policy doc). Files: `drizzle/0016_non_admin_audit_actor.sql`, journal, `schema/registration-operation-audit.ts`, `events/registration-audit/*`, manual-registration and registration-entitlements services/controllers/types, `test/registration-audit-actor.e2e-spec.ts`, `test/admin-manual-registration.e2e-spec.ts`, `test/event-activity-foundation.e2e-spec.ts` (migration count 17), audit policy contract.
- T3 — delegated writer (writer trigger: migration, two schemas, generator, confirmation helper, manual-registration service, catalog seed, five e2e specs, contract and runbook). Files: `drizzle/0017_registration_folio.sql`, journal, `schema/events.ts`, `schema/registrations.ts`, `events/registration-confirmation/*`, `manual-registration.service.ts`, `catalog-seed/november-catalog.ts`, `catalog-seed/seed-november-catalog.ts`, `test/registration-folio.e2e-spec.ts`, `test/admin-manual-registration.e2e-spec.ts`, `test/participant-registration.e2e-spec.ts`, `test/november-catalog-seed.e2e-spec.ts`, `test/event-activity-foundation.e2e-spec.ts` (migration count 18), `test/admin-registration-search.e2e-spec.ts` (fixture), `docs/contracts/admin-registration-operations.md`, `docs/runbooks/event-day.md`.
- T4 — delegated writer (writer trigger: validator, rules, service, controller, shared selectable query, normalization helper, unit and e2e specs, contracts). Files: `events/public-registration/*`, `events/participant-profile/participant-normalization*`, `events/registration-entitlements/selectable-activities.ts`, entitlements service, `events/events.module.ts`, `test/public-registration.e2e-spec.ts`, `docs/contracts/public-registration.md`, `docs/contracts/public-event-catalog.md`, `docs/contracts/admin-registration-audit-policy.md`.
