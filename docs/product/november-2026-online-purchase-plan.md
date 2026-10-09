# November 2026 online purchase plan

> **Status:** Planning document; not a contract.\
> **Date:** 2026-10-08\
> **Sources:** [November 2026 MVP proposal](november-2026-mvp-proposal.md) (organizer-facing, Spanish), [MVP delivery slices](november-2026-mvp-delivery-slices.md), epic #57 and Mercado Pago validation #59.

## Purpose

Plan MVP 3 (payment readiness): a buyer without an account buys passes for the November 2026 event from their phone, pays with Mercado Pago, and receives a confirmed registration with a folio. This document records the confirmed decisions, the buyer flow, the delivery order of the implementation issues, and what still depends on the organizer.

## Confirmed decisions (2026-10-08)

1. **Payment provider:** Mercado Pago Checkout Pro (hosted page). Development uses Mercado Pago test accounts and test credentials (sandbox). Production credentials are swapped in through configuration once the organizer's account exists. Checkout Bricks are not supported by test accounts. The [sandbox runbook](../runbooks/mercado-pago-sandbox.md) walks through a complete test purchase.
2. **Countries:** the MVP accepts only domestic (Mexico) payments. International payments are deferred until after the MVP.
3. **One purchase, one person:** the buyer is the participant. This fits the existing one-registration-per-person-per-event model.
4. **Confirmation:** a registration is confirmed only by a verified server-side Mercado Pago notification (signed webhook, then the payment is re-read by id), never by the browser redirect. The schema already supports `pending_payment` → `confirmed` with `confirmation_source = 'approved_payment'`.
5. **Legal acceptance:** three required checkboxes before paying: Reglamento oficial, Aviso de privacidad and Política de cancelación (the MVP has no refunds). The app shows the links and records acceptance (document version and timestamp). Texts come from the organizer; legal review is recommended. This is not legal advice, and the items in the [Mexico readiness checklist](../legal/mexico-readiness-checklist.md) remain pending.
6. **Mobile-first:** most buyers only have a phone. The buyer-facing UI is designed for phones first and also supports desktop. The phone-width e2e sweep is extended to the public screens.
7. **Full pass includes general entry:** general entry cannot be selected together with a full pass.
8. **Email is required** for online buyers (it stays optional in admin manual registration). The confirmation email with folio is part of the flow.
9. **Routes:** see [Routes](#routes).
10. **Timeline:** online sales open mid-November 2026. The open MVP 2 items (#125, #104, #105, #170) are prioritized after the MVP 3 issues below.
11. **Organizer dependencies:** the production account, exact fees, OXXO/SPEI availability, invoicing and tax withholding depend on the organizer's answers (see [What depends on the organizer](#what-depends-on-the-organizer)).

## Buyer flow

1. The buyer opens `/` and sees the event and its passes.
2. They choose passes. A full pass disables general entry; Open Styles is enabled only with at least one full pass.
3. They choose competitions for each purchased discipline (optional).
4. They enter their data (#58 fields, email required).
5. They review the purchase, read the overlap notice, accept the three legal documents and pay. A `pending_payment` registration is created.
6. They pay on the Mercado Pago Checkout Pro hosted page. The frontend gets its URL from `POST /public/events/:slug/registrations/:registrationId/checkout` (#177), which creates a new preference for a `pending_payment` registration on every call.
7. They return to a result screen (`/e/:slug/pago?registration=<id>`, for every outcome). It polls `GET /public/events/:slug/registrations/:registrationId/payment-status` ([contract](../contracts/public-payment-status.md), #178) right away and then every 3 s, at most 20 tries, and shows what it answers: confirming, confirmed with folio and passes, pending (an OXXO/SPEI voucher not yet paid, or a card payment Mercado Pago is still reviewing, such as the `CONT` test cardholder), or rejected with "Intentar de nuevo", which starts a new checkout for the same registration. After the 20 tries, a network error or a 429 it says the payment is taking longer and offers "Revisar de nuevo"; a voided or unknown registration gets a neutral message. The screens show only the first name and a masked email. The URL's own status is never trusted, and the confirmation email arrives once the webhook confirms the payment.

## Routes

| Route     | Audience       | MVP behavior                                                                                                         |
| --------- | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/`       | Buyers         | Public purchase flow, no login.                                                                                      |
| `/admin`  | Administrators | Unchanged.                                                                                                           |
| `/dancer` | Dancers        | Behind a dancer-role login boundary; not used by buyers in the MVP. Reserved for a possible future participant area. |

## Design references

- Buyer purchase flow design (mobile-first v1, 10 screens): https://claude.ai/artifact/3YcyJrmcNummhmW4DijMGW
- Payment provider decision and organizer questions: https://claude.ai/artifact/HGQut6GDbYYo9rE1xEJJv7

Both artifacts are private to the product owner's Claude account. Ask the product owner for access.

## Implementation issues

All issues belong to the milestone "MVP 3 — Payment readiness" and to epic #57.

| Week | Issue | Title                                                                             | Depends on                |
| ---- | ----- | --------------------------------------------------------------------------------- | ------------------------- |
| 1    | #174  | Create pending online registrations from the public purchase flow                 | #175                      |
| 1    | #175  | Expose a public event catalog and sales window                                    | —                         |
| 1–2  | #176  | Build the mobile-first public purchase screens                                    | #174, #175 (mocks first)  |
| 2    | #177  | Integrate Mercado Pago Checkout Pro in sandbox with verified webhook confirmation | #174                      |
| 3    | #178  | Show payment results after returning from Mercado Pago                            | #176, #177                |
| 3    | #179  | Send confirmation emails to online buyers                                         | #177                      |
| 3    | #180  | Publish legal documents and record buyer acceptance                               | #174, #176                |
| 4    | #181  | Handle abandoned pending online registrations                                     | #174, #177                |
| 5    | #182  | Launch online sales with production Mercado Pago credentials                      | All above, #59, organizer |

## Known gaps in the current code

- `registration_operation_audit` requires an admin actor and session, so public and webhook operations need a system actor or nullable actor and new operation types. The audit policy forbids storing provider payloads or payment instruments.
- `event_registrations.folio` is generated once when a registration becomes `confirmed` (cash or `approved_payment`); it is null while pending.
- Participant fields differ from #58 (no split name fields; email optional).
- Payment tables exist since #177 (migration 0018): `registration_checkouts` (one row per Checkout Pro preference), `registration_payments` (one row per Mercado Pago payment id) and the idempotent `payment_webhook_notifications` log. No card data or provider payloads are stored. There is still no order table. The verified webhook `POST /public/payments/mercado-pago/webhook` (#177) checks the `x-signature`, processes each notification once, re-reads the payment by id and confirms a pending registration with `approved_payment` and a `payment_approval` audit fact only when the amount and `MXN` currency match and the registration has a checkout in the configured mode.
- All endpoints are admin-only behind session and CSRF; no public endpoints, no rate limiting; events have no slug or sales-open state.
- The frontend has no public route and no shared form components; the phone-width sweep covers admin screens only.
- No mailer dependency or notification code.

## What depends on the organizer

These questions are tracked in #59 and block the production launch (#182), not the sandbox work:

- Who receives the money (person or company), RFC and tax regime.
- Whether a Mercado Pago account and a bank account already exist in that name.
- Availability of e.firma and constancia de situación fiscal.
- Whether the money is needed before the event (instant release vs 14-day release).
- Card only, or also OXXO/SPEI.
- Who pays the fees.
- Whether invoices must be issued.

The production account, exact fees, OXXO/SPEI on/off (which affects #181), invoicing and tax withholding depend on these answers. Tax topics must be confirmed with an accountant. The final legal texts for #180 also come from the organizer.

## MVP 2 reprioritization

To open online sales in mid-November, the MVP 3 issues above come first. The open MVP 2 items (#125, #104, #105, #170) continue afterwards.

## Out of scope for the MVP

- International payments.
- Refunds or editing payments in Mercado Pago.
- Buyer user accounts or a participant area.
