# Design: Breaking Event System Foundation

## Technical Approach

Future implementation is a staged NestJS modular monolith with module-owned persistence and FSD. This document plans, but does not authorize, the foundation gate and vertical releases.

## Architecture Decisions

| Decision              | Choice                                                                                                                                                                                | Rationale                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Module boundary       | Modules expose application contracts; API, domain, and persistence layers are used only where needed.                                                                                 | Prevents cross-module table writes and technical-layer coupling. |
| FSD/shared policy     | Keep FSD layers; extract `packages/shared` only after two consumers need a versioned contract.                                                                                        | Avoids release-cycle coupling.                                   |
| Data/migrations       | Release 1 adds organization/event/venue records. Use UUIDs, event scope, versions, composite references, and append-only redacted audit/outbox facts.                                 | Prevents cross-event links and lost updates.                     |
| Auth/credentials      | Argon2id password verification and opaque PostgreSQL sessions; protected browser identifier, expiry, revocation, safe denial, and audit. QR/PIN remain scoped, throttled credentials. | Enables revocation without exposing secrets.                     |
| Live competition      | Versioned, idempotent commands update aggregate, audit, and ordered outbox atomically. Socket.IO v4 projects updates; HTTP snapshots recover reconnects. No offline/manual replay.    | Preserves authority and recovery.                                |
| Experience/operations | Accessible responsive event theming, redacted logs, and restricted views.                                                                                                             | Branding cannot weaken accessibility or diagnosis.               |

## Data Flow

```text
FSD feature -> API -> application command -> domain validation
                     |                      |
Client <- snapshot/projection <- outbox <- transaction
                              (aggregate + audit + event)
```

The server sequences decisions; projection gaps/reconnects recover from versioned snapshots.

## Release Outcomes

| Release                | Actor entry                      | Frontend workflow                                                       | Protected backend persistence/audit                                   | Visible success, error, or recovery outcome                          |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1 Accreditation        | Organizer, staff, participant    | Accessible event shell, sign-in, enrollment, crew, and station check-in | Event/venue records; scoped identity, enrollment, check-in, and audit | Scoped confirmation; safe denial; current check-in state after retry |
| 2 Competition Live     | Judge, organizer, public viewer  | Live controls, scoring, status, and public competition projection       | Versioned authoritative competition state, audit, ordered outbox      | Finalized projection; stale/duplicate status; snapshot recovery      |
| 3 Workshops/Operations | Staff, instructor, participant   | Schedule, attendance, roster, and incident workspaces                   | Event-scoped capacity, attendance, assignments, incidents, and audit  | Capacity/status feedback; safe least-privilege denial                |
| 4 Commerce             | Buyer, cashier, finance operator | Catalog, order, inventory, and reconciliation workspaces                | Event-scoped orders, inventory movements, reconciliation, and audit   | Clear stock/order outcome; conflict or regulated-policy block        |

## File Changes

| File                                                              | Action   | Description             |
| ----------------------------------------------------------------- | -------- | ----------------------- |
| `openspec/changes/breaking-event-system-foundation/`, `docs/`     | Planning | This change's artifacts |
| `apps/backend/src/modules/`, `database/schema/`, `drizzle/`       | Future   | Modules and migrations  |
| `apps/frontend/src/{entities,features,widgets,pages,app,shared}/` | Future   | FSD workflows and shell |

## Interfaces / Contracts

REST/OpenAPI is the initial cross-app contract. Commands carry event, command, and expected-version identifiers; events carry event, sequence, type, time, and permitted payload fields. Socket.IO v4 is the future real-time transport; this plan installs no dependency.

## Testing Strategy

| Layer           | What                                             | Approach                                                          |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Unit            | Scope, policies, idempotency                     | RED-first Jest                                                    |
| Persistence/E2E | References, audit/outbox durability, safe denial | Testcontainers PostgreSQL 16, real migrations, cleanup, isolation |
| Browser         | Responsive status and recovery                   | Playwright                                                        |

## Threat Matrix

Routing is planned, but no shell, repository, VCS, PR, executable-classification, or process integration is designed.

| Boundary                 | Applicability                      | Design response / RED tests |
| ------------------------ | ---------------------------------- | --------------------------- |
| Documentation-like paths | N/A — no executable classification | None.                       |
| Git repository selection | N/A — no repository commands       | None.                       |
| Commit state             | N/A — no commit automation         | None.                       |
| Push state               | N/A — no push automation           | None.                       |
| PR commands              | N/A — no PR automation             | None.                       |

## Migration / Rollout

1. Foundation gate (non-user): record Mexico planning evidence and legal/policy blockers, resolve the listed domain questions, complete planning/runbook artifacts, and establish audit/outbox test and persistence foundations.
2. Release 1 — Accreditation: organization/event/venue schema, scoped relations, accessible event shell, secure identity/session handling, enrollment, crews, and accreditation station workflows.
3. Release 2 — Competition Live: authoritative competition commands, scoring, recovery, and public competition projection. Notifications and exports are deferred to later authorized work.
4. Release 3 — Workshops and Basic Operations; Release 4 — non-regulated Commerce. Keep each release full-stack, verifiable, and separately authorized before apply.

## Open Questions

- [ ] Complete required legal review for Mexico before country-specific waiver/consent, guardian/minor data, privacy retention/deletion, taxes, invoices, payments, payouts, prizes, or settlements proceed; make no compliance claim.
- [ ] Benchmark Argon2id and select multi-instance Socket.IO topology before those follow-ups.
