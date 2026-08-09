## Exploration: breaking-event-system-foundation

### Current State

The repository is an intentionally thin foundation: a NestJS API with a shared Drizzle/PostgreSQL connection and one `users` table; React/Vite pages are `/admin` and `/dancer` placeholders. Frontend roles (`admin`, `judge`, `dancer`) and a Zustand session store are display-only; `RoleAreaBoundary` explicitly does not authorize. There are no business modules, authentication, audit trail, real-time transport, payments, operational tooling, or production observability yet.

**Goal and outcomes.** Build an event-scoped coordination platform that makes registration, accreditation, commerce, operations, competition scoring, workshops, and live public results reliable and traceable during a time-critical breaking event. Primary actors are organizers/platform administrators, staff and accreditation operators, dancers/crews, judges, MCs/battle guests, vendors/cashiers, instructors/interpreters, sponsors, medical/security staff, and attendees. The settled planning model is one organizer operating multiple events; every business record requires clear event/organization scope.

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

### Settled Architecture

The architecture choice is settled: use a **modular monolith** with event-scoped bounded contexts, one NestJS deployment, and one PostgreSQL database. NestJS modules remain the encapsulation boundary with explicit exports; preserve `DatabaseModule`, while each business module owns its use cases and persistence mapping. Drizzle's existing schema-plus-generated-SQL migration model remains the schema change contract. Distributed services are not being reconsidered for this plan because they add premature operational complexity and duplicate authorization/audit concerns.

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

Within each module, use `api/`, `application/`, `domain/`, and `infrastructure/` only where complexity warrants it; expose a small public module API and do not share repositories or write across another module's tables. Keep `platform/` technical rather than a business dumping ground. The settled future transport is Socket.IO v4 through a module-owned NestJS Gateway; no dependency is installed by this planning change.

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

### Settled Release Sequence

1. **Foundation gate (non-user):** Mexico planning evidence, legal/policy blockers, unresolved-domain clarification, documentation, and audit/outbox test and persistence foundations.
2. **Release 1 — Accreditation:** organization/event/venue schema, accessible event shell, secure sign-in, enrollment, crews, and staff accreditation workflows.
3. **Release 2 — Competition Live:** authoritative competition controls, scoring, recovery, and public competition projection. Notifications and exports are deferred.
4. **Release 3 — Workshops and Basic Operations:** workshop and operational staff workflows.
5. **Release 4 — Commerce:** non-regulated catalog, inventory, orders, and reconciliation workflows.

Evidence: repository `docs/frontend-architecture.md` establishes FSD and defers package extraction until reuse; `apps/backend/package.json` contains NestJS, Drizzle, PostgreSQL, Swagger, Jest, and no real-time/auth/payment dependencies. NestJS official module/gateway guidance supports explicit feature modules and module-owned gateways; Drizzle official migration guidance supports the current schema-to-`drizzle/` migration workflow.

### Risks

- A four-digit PIN and printed QR are low-entropy/bearer credentials; treating either as standalone authentication would expose judge, access, financial, and scoring actions.
- Live brackets, judge votes, and public projection have concurrency and outage risks; correctness and snapshot recovery must be designed before UI delivery. Offline/manual replay is out of scope.
- Unresolved organization/event tenancy, payments/legal jurisdiction, minors/waivers, and data-retention assumptions can invalidate the data model later.
- The current repository has only unit and basic route E2E coverage; high-risk PostgreSQL invariants and event-day failure paths lack an integration-test harness.

### Ready for Proposal

Yes. The settled planning change defines the foundation gate and four vertical releases above. Mexico is the planning country; regulated behavior remains blocked pending legal/policy review. The 400-line review budget makes this a multi-slice plan; each release requires separate authorization before implementation.
