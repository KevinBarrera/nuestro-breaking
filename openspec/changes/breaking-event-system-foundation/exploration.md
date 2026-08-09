## Exploration: breaking-event-system-foundation

### Current State

The repository is an intentionally thin foundation: a NestJS API with a shared Drizzle/PostgreSQL connection and one `users` table; React/Vite pages are `/admin` and `/dancer` placeholders. Frontend roles (`admin`, `judge`, `dancer`) and a Zustand session store are display-only; `RoleAreaBoundary` explicitly does not authorize. There are no business modules, authentication, audit trail, real-time transport, payments, operational tooling, or production observability yet.

**Goal and outcomes.** Build an event-scoped coordination platform that makes registration, accreditation, commerce, operations, competition scoring, workshops, and live public results reliable and traceable during a time-critical breaking event. Primary actors are organizers/platform administrators, staff and accreditation operators, dancers/crews, judges, MCs/battle guests, vendors/cashiers, instructors/interpreters, sponsors, medical/security staff, and attendees. The planning boundary must first decide whether this is one organizer's multi-event platform or a single-event deployment; every business record otherwise needs a clear event/organization scope.

**Missing capabilities beyond the supplied business brief.**

- Event/organization configuration, branding, roles/delegated access, messaging, content/results publishing, reporting and data export.
- Payments, refunds, taxes/invoices, reconciliation, cash control, prize settlement, stock adjustments, and payment-provider/hardware integration boundaries.
- QR/PIN issuance, revocation, scanner/station management, manual/offline fallback, notification delivery, document/waiver versioning, consent and guardian handling.
- Audit/event history, support/incident workflows, backup/restore, migration/release operations, health monitoring, and privacy lifecycle controls.
- Security controls for short PIN and printed QR bearer credentials: rate limiting, expiry/revocation, scoped authorization, session/device policy, and immutable sensitive-action records.

### Affected Areas

- `apps/backend/src/app.module.ts` — currently composes only `DatabaseModule`; it needs a deliberate module composition boundary, not feature code yet.
- `apps/backend/src/database/schema/` and `apps/backend/drizzle/` — only a global `users` table and initial migration exist; future schemas must establish event scope, ownership, constraints, and migration governance.
- `apps/backend/src/main.ts` — CORS is fixed to local Vite and Swagger is the only platform concern; deployment, security, health, and real-time decisions remain unplanned.
- `apps/frontend/src/entities/session/` and `apps/frontend/src/app/router/` — the role model and route boundaries are temporary UI scaffolding, not authentication or authorization.
- `apps/frontend/src/{features,widgets,entities}/` — FSD reserves the correct layers for business actions and compositions but has no domain slices yet.
- `packages/shared/` — reserved but empty; repository guidance says not to extract shared packages without demonstrated reuse.
- `openspec/specs/` and `docs/` — no product specifications, domain glossary, architecture decisions, operational requirements, or threat/privacy documentation exist.

### Approaches

1. **Modular monolith with event-scoped bounded contexts** — Keep one NestJS deployment and PostgreSQL database, organized by business module with narrow exported application services and module-owned persistence/schema files.
   - Pros: fits the existing NestJS/Drizzle monorepo; transactional workflows such as accreditation and scoring stay consistent; deploys and operates simply; creates seams for later extraction.
   - Cons: requires strict ownership rules to prevent a shared-database tangle; real-time and payment workloads need explicit resilience design.
   - Effort: Medium

2. **Distributed services from the foundation** — Split commerce, competition, CRM, and live projection into independently deployed services now.
   - Pros: separate scaling and failure boundaries in theory.
   - Cons: premature operational complexity, distributed transactions, duplicated authorization/audit concerns, and slower delivery before workflows are validated.
   - Effort: High

### Recommendation

Adopt approach 1 and plan it as a **modular monolith**, not a generic technical-layer backend. NestJS documents modules as the encapsulation boundary for controllers/providers and requires explicit exports; that matches small, independently testable bounded contexts. Preserve the existing `DatabaseModule`, while each business module owns its use cases and persistence mapping. Drizzle's existing schema-plus-generated-SQL migration model should remain the schema change contract.

Proposed backend shape (plan only):

```text
apps/backend/src/
  platform/                 # database, configuration, health, API conventions, observability adapters
  modules/
    identity-access/        # accounts, credentials, roles, scoped authorization
    event-organization/     # organization, event, venue, brand/configuration
    participant-accreditation/ # profiles, crews, enrollment, waiver, check-in
    commerce-finance/       # catalog, orders, inventory, settlement
    operations/             # staff, travel, hospitality, sponsors, incidents
    competition/            # categories, brackets, rubrics, scores, results
    workshops/              # sessions, capacity, attendance, surveys
    communications-reporting/ # notifications, public results, exports
  app.module.ts
```

Within each module, use `api/`, `application/`, `domain/`, and `infrastructure/` only where complexity warrants it; expose a small public module API and do not share repositories or write across another module's tables. Keep `platform/` technical rather than a business dumping ground. Nest's documented gateway registration would place any later real-time gateway in the owning module, but `@nestjs/websockets` and a transport are not currently installed, so transport selection is an ADR/discovery item—not a dependency prescription.

This complements FSD: frontend `entities` model stable user-facing concepts, `features` own actions such as check-in or score submission, `widgets` compose workstations/screens, and `pages` route workspaces. Do not mirror every backend directory on the frontend. Retain application-local aliases and only create a workspace contracts package after a real shared contract consumer is established; the current `packages/shared` has no implementation and repository guidance rejects preemptive extraction.

Initial requirement categories for subsequent specs:

| Category                         | Planning requirements to define before implementation                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data foundations                 | Organization/event scoping; stable IDs; money/currency and temporal semantics; lifecycle states; uniqueness/referential constraints; migrations, retention, and restoration.                                                                 |
| Authentication and authorization | Account recovery; multi-role and event/venue/context-scoped permissions; secure staff/judge flows; PIN/QR expiry, revocation, throttling, and fallback verification.                                                                         |
| Auditability                     | Actor, time, device/station, before/after, and reason records for access, financial, accreditation, bracket, and score decisions; tamper-evident retention and export policy.                                                                |
| Responsive and brandable UI      | Event theme/configuration, responsive operator and projection views, scanner-friendly flows, keyboard operation, localization strategy, and accessibility acceptance criteria.                                                               |
| Real-time resilience             | Server-authoritative scoring/results; idempotency, sequencing/version checks, transaction boundaries, reconnection snapshots, degraded/manual workflows, and projection recovery.                                                            |
| Observability                    | Structured correlation IDs, security-safe logs, health/readiness, metrics/traces, alerts, runbooks, and measurable service objectives for event-day flows.                                                                                   |
| Security and privacy             | Threat model, data classification, least privilege, secrets/encryption policy, rate limits, dependency/update policy, consent/waiver/minor-data rules, retention/deletion/export obligations.                                                |
| Testing and operations           | Strict TDD using the current Jest/Playwright capability; add a planned integration-test layer for database invariants; contract/E2E/load/failure-recovery tests; migration rehearsal, backup restore, release/rollback, and incident drills. |

Planning documentation set: product vision and event-scope assumptions; glossary and bounded-context map; domain specs with Given/When/Then scenarios; context-specific data model and lifecycle diagrams; ADRs for tenancy, credential/QR/PIN policy, authorization, audit, real-time transport, and offline fallback; API/event contract and versioning policy; threat model/privacy and compliance assessment; design system/accessibility/branding brief; payment/scanner/integration contracts; test strategy; event-day operating, incident, backup/recovery, and support runbooks.

Evidence: repository `docs/frontend-architecture.md` establishes FSD and defers package extraction until reuse; `apps/backend/package.json` contains NestJS, Drizzle, PostgreSQL, Swagger, Jest, and no real-time/auth/payment dependencies. NestJS official module/gateway guidance supports explicit feature modules and module-owned gateways; Drizzle official migration guidance supports the current schema-to-`drizzle/` migration workflow.

### Risks

- A four-digit PIN and printed QR are low-entropy/bearer credentials; treating either as standalone authentication would expose judge, access, financial, and scoring actions.
- Live brackets, judge votes, and public projection have concurrency and outage risks; correctness, recovery, and manual fallback must be designed before UI delivery.
- Unresolved organization/event tenancy, payments/legal jurisdiction, minors/waivers, and data-retention assumptions can invalidate the data model later.
- The current repository has only unit and basic route E2E coverage; high-risk PostgreSQL invariants and event-day failure paths lack an integration-test harness.

### Ready for Proposal

Yes, for a foundation proposal only. Tell the user that the proposal should lock the event/organization tenancy model, credential trust model, initial bounded-context release slice, legal/payment jurisdiction assumptions, and the real-time/offline acceptance bar before any product implementation. The 400-line review budget makes this a multi-slice plan; apply must ask before an oversized first slice.
