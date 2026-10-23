# Event location

Objective: events store where they happen (city, state, country) instead of showing the time zone label as a location (#322).
Branches: `feat/322-01-event-location-backend` → `dev`, then `feat/322-02-event-location-frontend` chained on it. Delivery: one PR per task (chained).
Test runner: Jest unit + PostgreSQL e2e (backend), Vitest + Playwright (frontend).

## Specs

- **S1** Source: issue #322 and the "NOTE FOR CLAUDE CODE: new use case, event location" on "3 · Eventos" of https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf.
- **S2** Backend: "add city, state and country (ISO 3166-1 alpha-2, default MX) to the event model, plus a migration. Do not derive existing values from the time zone. Leave them empty and have the admin fill them in."
- **S3** API: "accept and validate the fields on create and update, and return them in event list and detail responses." "All three are required." "Location is NOT a permanent identifier: it stays editable after creation."
- **S4** Frontend forms: "the Nuevo evento form ... now asks for Ciudad, Estado and País (País defaults to México)"; "Datos del evento (editable, in the General section)". Hint: "Dónde sucede el evento. Se muestra en la lista de eventos, en el resumen y en la página de compra." "TextField and Select from @/shared/ui, 44px targets, no required marks."
- **S5** Readers: the Eventos list and the Resumen header "must read these fields instead of the time zone label. Hide the location when it is empty."
- Assumptions: the three fields are set together or not at all (a stored location is never partial, and an edit cannot clear it); the default MX is the form's default, not a database default, so existing rows stay empty. The public page and emails do not show a location today; showing it there is a follow-up (issue "Out of scope").

## Tasks

| ID  | Specs  | Route  | Status | Commit           |
| --- | ------ | ------ | ------ | ---------------- |
| T1  | S2, S3 | inline | done   | 7c238ce, e97857b |
| T2  | S4, S5 | inline | done   | 0238efc, dc07118 |

## Log

- **L1 (2026-10-22, user):** "estamos trabajando en el epic https://github.com/KevinBarrera/nuestro-breaking/issues/312 ya completamos Admin navigation y Event screens. El siguiente task es implementar el nuevo diseño https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-e9a39eef76fa Tienes acceso a mi navegador Google Chrome para que veas los cambios que implementas y te quede tan parecido al diseño como sea posible. Esta vez el diseño incluye una nota pues involucra nueva funcionalidad (nueva data para la entidad "events" referente a la ubicación). Crea los dos issues: uno exclusivo de UI/UX para la implementación del diseño (ligado al epic) y otro para la nueva funcionalidad y comenzamos el desarrollo"
- **L2:** Issues #323 (UI, sub-issue of #312) and #322 (location). #322 goes first; #323 builds on it (`odd/tasks/events-redesign.md`).
- **L3:** T1 `7c238ce`: backend unit 636/636, e2e 46 suites / 523 tests. Native review (risk, reliability) approved and acknowledged; two non-blocking reliability advisories on `admin-event-input.ts` (country check, place parsing).
- **L4:** T2: shared `LocationFields` on Nuevo evento and Datos del evento; `eventLocation` replaces the zone label on the event cards and the Resumen header (hidden when empty). An event without a location saves other edits without one; typing a city or state requires the whole location. Vitest 758/758; `pnpm verify:pr` 560 passed, 1 timeout in `admin-select.spec.ts` under full-suite load (passes 3/3 alone).
- **L5:** Independent verifier: S1–S5 met, no blockers. Fixed two advisories: a country-only change on an event without a location was dropped on save (`dc07118`), and Intl-named non-ISO codes (XK, IC, SU, …) passed as countries (`e97857b`). Open advisory: the hint promises the location on the purchase page, which is the documented follow-up.
