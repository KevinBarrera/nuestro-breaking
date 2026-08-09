# ADR 0002: Use Username/Password Authentication with Opaque PostgreSQL Sessions

## Status

Accepted.

## Context

The identity-access foundation needs an initial human authentication credential and session model. Protected operations need expiry, immediate revocation, and auditable session lifecycle controls without exposing a reusable server credential to browser code.

## Decision

Username and password authenticate the user. Successful authentication creates an opaque, server-side session stored in PostgreSQL. Only the session ID reaches the browser, in an `HttpOnly`, `Secure`, `SameSite` cookie.

The server MUST enforce session expiry, support immediate revocation, and audit authentication and session lifecycle events. Authentication and session cookies require HTTPS. State-changing requests require CSRF and origin protections.

Password storage uses Argon2id via `node-argon2`. Store only its PHC-formatted hash and verify passwords asynchronously. Never log passwords, password hashes, or reset tokens. Benchmark parameter values on the actual deployment before implementation; use scrypt only when Argon2id is not viable. Rehash on successful login when parameters are upgraded.

## Consequences

- Identity work can plan around username/password authentication and opaque PostgreSQL-backed sessions.
- Revoking a session takes effect immediately because the server validates the session record for each authenticated request.
- Implementers must not treat this ADR as approval for plaintext storage, reversible password encryption, installed dependencies, or a complete session lifetime/renewal policy.

## Non-goals / Follow-ups

- Benchmark and document Argon2id parameters on the actual deployment.
- Define session lifetime and renewal policy as focused implementation work.
- This ADR does not implement authentication or install dependencies.

## Evidence

- `openspec/changes/breaking-event-system-foundation/design.md` records the approved identity/session model before protected endpoints are implemented.
- `openspec/changes/breaking-event-system-foundation/tasks.md` schedules identity/access safeguards after the ADR gates.
