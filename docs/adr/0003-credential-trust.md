# ADR 0003: QR and PIN Credentials Have Restricted Judge Access

## Status

Accepted for planning.

## Context

Event-day judges need fast access, but QR and PIN credentials are transferable. They cannot establish unrestricted proof of a person's identity.

## Decision

QR and PIN are restricted, event-scoped, revocable credentials for judge access. They are not proof of unrestricted identity.

QR is treated as an opaque bearer secret, and PIN is an approved verifier. Both credential types require least privilege, event and role scope, issue and expiry controls, rotation and revocation, throttling, station/session controls, immutable success/failure audit, and recorded residual risk.

## Consequences

- Judge access can be designed for constrained event operations without granting broad account authority.
- Authorization must be evaluated from active, scoped roles for every command.
- Transferability remains an explicit risk to mitigate and record, not a property to ignore.

## Non-goals / Follow-ups

- This ADR does not establish a general identity-proofing process.
- Define credential issuance, recovery, rotation, rate-limit, and audit-retention details before implementation.
- This ADR does not implement credential flows or install dependencies.

## Evidence

- `openspec/changes/breaking-event-system-foundation/proposal.md` records QR/PIN transferability and its planned mitigations.
- `openspec/changes/breaking-event-system-foundation/design.md` defines the same scope, controls, and audit expectations.
