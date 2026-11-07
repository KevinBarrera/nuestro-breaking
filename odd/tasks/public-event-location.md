# Public event location

Objective: buyers see where the event happens on the public purchase pages and in the confirmation email (#330, follow-up of #322).
Branches: `feat/330-01-public-location-api` from `dev`, then `feat/330-02-public-location-page` on it. Delivery: chained PRs per slice.
Test runner: Jest (backend unit + PostgreSQL e2e), Vitest for pure frontend logic, Playwright (`apps/frontend/e2e`) for flows. Visual check in Chrome at `localhost:5173`, light and dark, phone width.

## Specs

- **S1** (#330 Scope 1) "Public API: add the location to the public event (for example `city`, `state`, `country`, all `null` while the event has none). Additive; existing fields stay."
- **S2** (#330 Scope 2) "Public purchase pages: show the location with the event dates, formatted like the admin panel (`eventLocation`: city and state, plus the country name outside Mexico; the state is left out when it repeats the city). Hide it when the event has no location; never show the time zone instead."
- **S3** (#330 Scope 3) "Confirmation email: add a "Lugar:" line next to "Fecha:" in the text and HTML versions, with the same format, left out when the event has no location. Escape it like the other values."
- **S4** (#330 Scope 4) "Docs: the public event catalog and confirmation email contracts."
- **S5** (#330 Acceptance) "Backend unit and e2e coverage for the public field (with and without a location) and for the email line (present, absent, escaped)." / "Vitest for the shared location text; Playwright for the public page with and without a location, including phone width."
- **S6** Frontend follows the design system https://claude.ai/artifact/7SRpK5YDMUVAEzuC5RNDef (`--nb-*` tokens in both themes, inline `currentColor` icons, 44px targets, 4.5:1 contrast, no horizontal scroll at 375px), checked in the browser. The user: "para la parte del FE por favor sigue nuestro design system".
- Out of scope (#330): venues, street address or map; suggesting the time zone from the location.

## Tasks

| ID  | Specs          | Route  | Status  | Commit |
| --- | -------------- | ------ | ------- | ------ |
| T1  | S1, S3, S4, S5 | inline | pending |        |
| T2  | S2, S5, S6     | inline | pending |        |

T1 = backend public field + email line + contracts. T2 = shared location text + public pages.

## Log

- **L1 (2026-11-06, user):** "sí, comienza con el #330, para la parte del FE por favor sigue nuestro design system https://claude.ai/artifact/7SRpK5YDMUVAEzuC5RNDef - cuando trabajes el FE ve revisando cómo se ve la implementación a través del acceso al navegador para aseguranos que no rompamos nada y se vea todo alineado al design system"
- **L2:** Mapped. Backend: `PublicCatalogService.event` selects the row, `toPublicCatalog` copies an allowlist; email input built in `ConfirmationEmailDispatcher.compose`. Frontend: `eventLocation` lives in `pages/admin/ui/event-model.ts`, which public pages cannot import (FSD), so it moves to `@/entities/event-catalog`; the frontend reader tolerates a missing location so a frontend deployed before the backend still works. Dates show in the home header and the passes frame `aside`. Route: inline for both tasks (one sequential chain, no writer reason).
