# ADR 0001: Mexico Is the Initial Operating Country

## Status

Accepted for planning.

## Context

Country-specific rules affect waivers, minors, data retention, tax, invoices, payments, payouts, prizes, and settlement. The foundation plan previously left the operating country unnamed and blocked those behaviors.

## Decision

Mexico is the initial operating country for product planning.

Legal review is still required before any country-specific waiver, minors, retention, tax, invoice, payment, payout, prize, or settlement behavior is implemented. This ADR makes no legal, regulatory, tax, privacy, or compliance claim.

## Consequences

- Planning can use Mexico as the jurisdictional starting point for later discovery.
- Regulated-domain behavior remains blocked until the required legal review and resulting requirements are documented.

## Non-goals / Follow-ups

- This ADR does not approve or define country-specific implementation.
- Obtain legal review and create focused requirements before implementing the blocked behaviors.

## Evidence

- `openspec/changes/breaking-event-system-foundation/proposal.md` identifies naming the initial operating country as a dependency.
- `openspec/changes/breaking-event-system-foundation/design.md` lists the affected behaviors as blocked and requires no compliance claim.
