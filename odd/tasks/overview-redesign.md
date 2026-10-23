# Event overview redesign

Objective: the admin "Resumen del evento" screen follows the new design (#317, epic #312).
Branch: `feat/317-overview-redesign` → `dev` (base `629864b`), one commit per task; chained PRs per slice when the branch passes ~400 authored lines.
Test runner: Vitest for pure logic, Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice.

## Specs

- **S1** Design source: "2 · Resumen del evento" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (artboards "Resumen del evento" and "Componente · Tabla"). The result is compared in the running app at `/admin/events/:eventId`, light and dark.
- **S2** Header: "Resumen del evento", then the event name, its dates on the event clock and its city, each with an icon.
- **S3** Quick action cards are removed: "no queremos las tres tarjetas de acceso rápido, ese es el nuevo diseño".
- **S4** From desktop width, "Venta en línea" (wide) and "Catálogo" (narrow) sit side by side; stacked at phone width.
- **S5** Venta en línea card: description "Decide si el público puede comprar pases y en qué fechas.", a sales pill ("Venta abierta" / "Venta cerrada"); a `role="switch"` row "Venta en línea activa" with the hint "El público puede comprar dentro del periodo de venta." / "Apagada, la venta queda cerrada aunque las fechas estén dentro del periodo."; "Periodo de venta" with the zone hint and "Apertura (opcional)" / "Cierre (opcional)"; "Dirección pública" with "Copiar" (then "Copiada") and "Abrir"; "Guardar cambios" in a footer bar. Save rules, validation and errors stay as today.
- **S6** Catálogo card: description "Lo que este evento ofrece." and one link tile per count ("pases activos" → "Ver pases", activity kinds → "Ver actividades"), replacing "Editar".
- **S7** "Pases a la venta" on a reusable table component: description "Lo que el público puede comprar en línea.", headers Pase, Clase, Incluye, Precio, the pass name links to its pass, the class as a chip, a footer with the pass count and "Precios en MXN".
- **S8** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width (the table scrolls in its own box).

## Tasks

| ID  | Specs              | Route  | Status  | Commit |
| --- | ------------------ | ------ | ------- | ------ |
| T1  | S7, S8             | inline | pending |        |
| T2  | S2, S3, S4, S6, S8 | inline | pending |        |
| T3  | S5, S8             | inline | pending |        |

## Log

- **L1 (2026-10-22, user):** "Genial, mientras en otro worktree comencemos a trabajar en el rediseño de "Resumen del evento" aquí el diseño mejorado: https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-e3c000f0c675 misma dinámica, usa la extensión de chrome para acceder al sitio y monitorear"
- **L2 (2026-10-22, user):** "crea un nuevo issue en GH para esta nueva task" → #317, sub-issue of #312.
- **L3 (2026-10-22, user):** "no queremos las tres tarjetas de acceso rápido, ese es el nuevo diseño"
- **L4:** Worktree `../nuestro-breaking-worktrees/317-overview-redesign`; its Vite serves `localhost:5173` (the backend admits one admin origin). Date and city reuse `eventDates` / `eventZoneName` from `event-model.ts`, read from `listAdminEvents`.
- **Next:** T1.
