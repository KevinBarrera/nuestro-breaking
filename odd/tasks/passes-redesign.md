# Passes redesign

Objective: the admin "Catálogo › Pases" section follows the "11 · Catálogo › Pases" design (#372 list, #373 create and edit, epic #312).
Branches: chained from `dev`, one per task (`feat/37N-0N-…`). Delivery: chained PRs per slice.
Test runner: Vitest for pure logic and Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice. Visual check in Chrome at `localhost:5173`, light and dark.

## Specs

- **S1** Design source: "11 · Catálogo › Pases" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (page "Pases", artboards "Pases · lista", "Pases · sin pases", "Nuevo pase (interactivo)", "Editar pase · sin cambios", "Editar pase · con cambios sin guardar", "Editar pase · revisar cambios", "Editar pase · archivar"), plus the canvas note "Pases redesign, assumptions to confirm before building". No API change. The user: "Esta sección es sumamente importante, entonces cuidemos la funcionalidad de la misma."
- **S2** (#372) Header "Pases" / "Lo que el público compra. Cada pase tiene un precio y define a qué actividades da acceso." + "Nuevo pase"; tabs "Activos N" / "Archivados N".
- **S3** (#372) Groups "Pases completos" / "Dan acceso a actividades. Es el pase de quien compite.", "Entrada general" / "Solo la entrada al evento.", "Adicionales" / "Se compran junto con un pase completo."; rows Pase | Precio (mono, "Sin costo" for 0) | Acceso | Vendidos | Venta en línea | chevron; narrow width stacks.
- **S4** (#372) Acceso summary: "Entrada al evento", "Incluye N actividad(es)", "Elige entre N", "Requiere pase completo" / "Requiere entrada general", "Sin actividades"; active activities only.
- **S5** (#372) Vendidos from the attendee-lists snapshot (confirmed registrations holding the pass), "1 vendido" / "N vendidos"; hidden when the snapshot fails.
- **S6** (#372) Pill "En venta" / "Venta cerrada" (pass close date passed or event sale `closed`); the "Activo" pill goes.
- **S7** (#372) Warning pill "No da acceso a ninguna actividad" (Completo/Adicional without active links) and notice "<Pase> no da acceso a ninguna actividad." / "N pases no dan acceso a ninguna actividad." + "Quien lo compre no podrá inscribirse a competencias. Ábrelo y elige sus actividades, o cámbialo a Entrada general."
- **S8** (#372) Archivados: grouped rows with "Restaurar" (no confirmation), notice "Restauraste <nombre>. Vuelve a estar en venta."; empty "No hay pases archivados" / "Cuando archives un pase aparecerá aquí. Quien ya lo compró lo conserva."; event empty "Aún no hay pases" + "Crear el primer pase" + the Actividades tip.
- **S9** (#373) Editor layout: breadcrumb, title, edit header pill + vendidos, form left, sticky preview right; no version label.
- **S10** (#373) Datos: Nombre, Clase radio cards, Adicional keeps "Requiere pase", Precio `$`/`MXN`, Venta en línea radio cards with presets, Día, Hora (24 h) and the close sentence / after-event warning.
- **S11** (#373) Acceso: counter, legend, search, "Solo con acceso", day groups with "Todas elegibles" / "Quitar acceso", three-state radio rows, empty and warning copy; General keeps the section (backend accepts its activities).
- **S12** (#373) Preview "Así se ve en la página de compra".
- **S13** (#373) Create saves directly ("Crear pase"), opens the pass with "Creaste <nombre>. Ya está en venta.", no leave prompt.
- **S14** (#373) Edit: one draft, sticky bar "N cambios sin guardar" / "Descartar" / "Revisar cambios", one review (datos + acceso, price note), PATCH then PUT, one result "Guardaste los cambios de <nombre>.", partial failure keeps the access edits; no leave prompt after a save.
- **S15** (#373) Archive section at the bottom, dialog "¿Archivar <nombre>?" with the buyers line, primary "Archivar", back to the list with "Archivaste <nombre>."
- **S16** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width; docs updated when behavior changes.

## Tasks

| ID  | Specs      | Route  | Status  | Commit |
| --- | ---------- | ------ | ------- | ------ |
| T1  | S3–S7      | inline | pending |        |
| T2  | S2–S8, S16 | inline | pending |        |
| T3  | S10–S14    | inline | pending |        |
| T4  | S9–S16     | inline | pending |        |

T1 = list model (pure), T2 = list screen, T3 = editor model (pure), T4 = editor screens.

## Log

- **L1 (2026-10-24, user):** "Es un rediseño/mejora-completa para la sección de "Catálogo › Pases", revisa y entiende por completo el nuevo diseño: https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-8021ec9b1d38 Crea el issue necesario en GH (o más de uno de ser necesario) para cumplir por completo con lo que el nuevo diseño indica Una vez todo este listo comienza a trabajar, tienes acceso a mi navegador para que te asegures que la implementación queda lo más parecida posible al nuevo diseño. Esta sección es sumamente importante, entonces cuidemos la funcionalidad de la misma. Comencemos!"
- **L2:** Checked the canvas note against the code. Vendidos: the attendee-lists snapshot has `passTypeIds` and `status` per registration. Event sale state: `GET /sales` (`state`, `reason`). The backend has no rule against activities on a general pass (entitlements come from access rows), so the General access section stays visible. The design drops "Requiere pase"; it stays for Adicional so no behavior is lost. The note says a switch for the close date; the artboards show radio cards with presets, which win. Restore follows Actividades (no confirmation). Issues #372 and #373 created and added to #312. Route: inline for every task (one sequential chain).
