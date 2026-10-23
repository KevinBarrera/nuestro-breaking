# Events screens redesign

Objective: the admin event list, Nuevo evento and Datos del evento follow the "3 · Eventos" design (#323, epic #312).
Branches: chained on `feat/322-02-event-location-frontend`, one per task (`feat/323-0N-…`). Delivery: chained PRs per slice.
Test runner: Vitest for pure logic, Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice. Visual check in Chrome at `localhost:5173`, light and dark.

## Specs

- **S1** Design source: "3 · Eventos" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (artboards "Eventos · lista", "Eventos · sin eventos", "Nuevo evento", "Datos del evento").
- **S2** Eventos · lista: "Eventos", "Elige el evento que vas a operar o crea uno nuevo.", "Crear evento"; "Activos" / "Archivados" tabs with counts; cards with a date tile (month and days, or "Por definir"), name, dates, location, `/e/<slug>`, the sales pill ("Venta abierta" / "Venta cerrada") and a chevron. Archivados keeps restore; empty: "No hay eventos archivados" / "Los eventos que archives desde Datos del evento aparecen aquí y se pueden restaurar."
- **S3** Eventos · sin eventos: "Aún no hay eventos", "Crea el primero para empezar. Después lo dejas listo en tres pasos.", steps "Agrega competencias y workshops" / "Las actividades que va a tener el evento.", "Crea los pases y sus precios" / "Lo que el público va a comprar.", "Abre la venta y opera el check-in" / "Cuando el catálogo esté listo.", and "Crear evento".
- **S4** Nuevo evento: "Datos generales" card (name, Ubicación, Zona horaria, optional dates), the "Identificadores permanentes" panel (address with `/e/`, folio prefix, "Así se verá un folio"), the closed-sales note, Cancelar / Crear evento. Create rules stay.
- **S5** Datos del evento: two-column sections General, Identificadores (address with "Copiar" → "Copiada", folio prefix with an example), Sedes, Archivar o eliminar; "Tienes cambios sin guardar" bar with Descartar / Guardar cambios. Save, archive and delete rules stay.
- **S6** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width.

## Tasks

| ID  | Specs      | Route  | Status  | Commit |
| --- | ---------- | ------ | ------- | ------ |
| T1  | S2, S3, S6 | inline | done    | (T1)   |
| T2  | S4, S6     | inline | pending |        |
| T3  | S5, S6     | inline | pending |        |

## Log

- **L1 (2026-10-22, user):** see `odd/tasks/event-location.md` L1 (same request).
- **L2 (2026-10-22, user):** "levantalo tu" → Vite on `localhost:5173` from this checkout; backend already on 3000.
- **L3:** T1: tabs (arrow keys move between them; a restore goes back to Activos), date tile from `eventDateTile`, location with a pin, sales pill with a dot, the new empty state. The card meta keeps `eventDates` ("21–22 de noviembre de 2026"), shared with the Resumen header, instead of the artboard's weekday form; the folio pattern leaves the cards, as in the design. Checked in Chrome (light, dark, empty, narrow). `verify:pr`: 760 unit; e2e green after pointing the sweep's Eventos reveal step at the Archivados tab (163/163 sweeps).
