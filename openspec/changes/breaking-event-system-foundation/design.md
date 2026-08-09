# Design: Breaking Event System Foundation

## Technical Approach

Implement eight capabilities as a staged NestJS modular monolith: one PostgreSQL deployment, module-owned persistence, and narrow contracts. Retain `DatabaseModule`, Drizzle, aliases, and React FSD. Establish scope, authorization, audit, and recovery before breadth.

## Architecture Decisions

| Decision                     | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rationale                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Module boundary              | Create `apps/backend/src/modules/<capability>/{api,application,domain,infrastructure}/` and `<capability>.module.ts`. API owns controllers/DTOs; application, use cases/public contracts; domain, Nest/Drizzle-free rules/events; infrastructure, repositories/adapters. Consume only other modules' public application contracts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bounded ownership without microservice or technical-layer coupling.                                   |
| FSD and shared policy        | Do not mirror backend modules. FSD: `entities` event/session models, `features` actions, `widgets` workspaces, `pages` routes. Extend `RoleAreaBoundary` after auth. Do not extract `packages/shared` until a framework-neutral, versioned contract has two consumers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Preserves downward imports and avoids release-cycle coupling.                                         |
| Data and migration ownership | Keep UUIDs, including `users`. Add one organization, events, venues, brands, and event records. Mutable entities have `id`, `eventId`, timestamps, `version`; money is minor-unit integer plus ISO currency. Enforce composite `(id,event_id)` references. Append-only audit/outbox facts contain event, actor/credential, time, result, redacted payload. Modules own `schema/<module>.ts` and migration review; `index.ts` aggregates and Drizzle emits `drizzle/`.                                                                                                                                                                                                                                                                                                                                                                                        | Scope and optimistic versions prevent cross-event links and lost updates.                             |
| Auth and credentials         | Username/password authenticates the user. Password storage uses Argon2id via `node-argon2`: retain only the PHC-formatted hash, verify asynchronously, never log passwords, hashes, or reset tokens, and rehash on successful login after parameter upgrades. Benchmark parameters on the actual deployment; scrypt is a fallback only if Argon2id is not viable. An opaque server-side session is stored in PostgreSQL; only its ID reaches the browser in an `HttpOnly`, `Secure`, `SameSite` cookie. Enforce expiry, immediate revocation, HTTPS, CSRF/origin protections, and authentication/session audit. Authorize every command from active scoped roles. QR is an opaque bearer secret; PIN is an approved verifier. Both have scope, issue/expiry, rotation/revocation, throttling, station/session controls, and immutable success/failure audit. | Browser credentials remain constrained while server-side session state supports revocation and audit. |
| Live competition             | Commands carry `eventId`, `commandId`, `expectedVersion`, actor, payload. One transaction validates policy/rubric/state, updates aggregate/version, and writes audit plus ordered outbox. Duplicates return their original result; stale versions return authority. Projections consume sequence numbers idempotently; reconnects fetch a snapshot first. No offline/manual replay. Socket.IO v4 through a NestJS Gateway is the approved transport; HTTP snapshot is recovery. Multi-instance scaling remains a follow-up.                                                                                                                                                                                                                                                                                                                                  | Authority, concurrency, and recovery stay transport-independent.                                      |
| Experience and operations    | Event context applies constrained theme variables through `app`/`shared`; preserve contrast, focus, text status, responsive layouts, keyboard/screen-reader operation. Use structured redacted logs and health signals; minimize PII, never log credentials, and restrict views/exports.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Branding must not weaken accessibility or safe diagnosis.                                             |

## Data Flow

```text
FSD feature -> API -> application command -> domain validation
                     |                      |
Client <- snapshot/projection <- outbox <- transaction
                              (aggregate + audit + event)
```

The server sequences decisions; projection gaps/reconnects recover from versioned snapshots.

## File Changes

| File                                                                   | Action                | Description                                          |
| ---------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `openspec/changes/breaking-event-system-foundation/design.md`          | Create                | This artifact.                                       |
| `apps/backend/src/modules/<capability>/`                               | Planned create        | Eight modules.                                       |
| `apps/backend/src/database/schema/<module>.ts`, `index.ts`, `drizzle/` | Planned modify/create | Schemas/migrations.                                  |
| `apps/frontend/src/{entities,features,widgets,pages,app,shared}/`      | Planned modify/create | FSD event actions/context/theme.                     |
| `docs/{adr,runbooks}/`                                                 | Planned create        | Auth, transport, recovery, privacy/threat decisions. |

## Interfaces / Contracts

```ts
type Command = {
  eventId: string;
  commandId: string;
  expectedVersion: number;
  payload: unknown;
};
type DomainEvent = {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: unknown;
};
```

REST/OpenAPI is the initial cross-app contract. Socket.IO v4 through a NestJS Gateway is the approved real-time transport; this planning artifact does not install dependencies. Expose stable IDs, timestamps, permitted fields, amount/currency, version.

## Testing Strategy

| Layer           | What                                                                    | Approach                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit            | Scope/lifecycle, policies, QR/PIN, money, idempotency, stale scores     | Strict RED-first Jest tests beside domain/application code.                                                                                                                                            |
| Persistence/E2E | Composite references, transaction/outbox/audit durability, safe denials | Use Testcontainers Node with ephemeral PostgreSQL 16, real migrations, cleanup, and isolation. It requires a Docker-compatible runtime; CI parallelization and harness optimization remain follow-ups. |
| Browser         | Responsive routes, keyboard/status, theme, recovery                     | Playwright; no new accessibility dependency without discovery.                                                                                                                                         |

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

1. ADR and review gates: Mexico legal review; approved username/password with Argon2id and opaque PostgreSQL sessions; Socket.IO Gateway transport; Testcontainers PostgreSQL 16 harness; privacy/threat/recovery runbooks.
2. Foundation: organization/event/venue/brand, scoped relations, audit/outbox, authorization seam, accessible event shell.
3. Identity/accreditation; competition commands/projections/recovery; then workshops, operations, commerce, communications/reporting. Keep apply work verifiable and ask before a 400-line risk.

## Open Questions

- [ ] Complete required legal review for Mexico before country-specific waiver/consent, guardian/minor data, privacy retention/deletion, taxes, invoices, payments, payouts, prizes, or settlements proceed; make no compliance claim.
- [ ] Benchmark Argon2id parameters on the actual deployment, and select a broker/adapter topology for multi-instance Socket.IO scaling, before implementing those follow-ups.
