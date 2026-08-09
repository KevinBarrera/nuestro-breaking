# ADR 0006: Use Testcontainers Node with Ephemeral PostgreSQL 16

## Status

Accepted for planning.

## Context

Persistence and E2E tests need to verify PostgreSQL behavior that mocked database services cannot prove, including migrations, transactional durability, scoped references, audit, and outbox behavior.

## Decision

Use Testcontainers Node with ephemeral PostgreSQL 16 as the E2E and integration test harness.

The harness MUST apply real migrations and provide cleanup and isolation between tests. It requires a Docker-compatible runtime. CI parallelization and harness optimization are deferred. This ADR does not install dependencies.

## Consequences

- Persistence and E2E planning can verify PostgreSQL-specific behavior against a disposable database.
- Developers and CI runners need a Docker-compatible runtime when these tests are implemented.
- Test design must own database lifecycle, cleanup, and isolation rather than relying on shared state.

## Non-goals / Follow-ups

- This ADR does not choose CI parallelism, image caching, startup optimization, or a final test-runner configuration.
- Define migration bootstrap, lifecycle helpers, and isolation strategy before implementation.
- This ADR does not add Testcontainers or PostgreSQL dependencies.

## Evidence

- `openspec/changes/breaking-event-system-foundation/design.md` requires a PostgreSQL harness decision before persistence testing.
- `openspec/changes/breaking-event-system-foundation/tasks.md` places harness selection, reset, and migrations before persistence tests.
