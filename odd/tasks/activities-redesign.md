# Activities redesign

Objective: the admin "Catálogo › Actividades" section follows the "10 · Catálogo › Actividades" design (#367 list, #368 form, epic #312).
Branches: chained from `dev`, one per task (`feat/36N-0N-…`). Delivery: chained PRs per slice.
Test runner: Vitest for pure logic and Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice. Visual check in Chrome at `localhost:5173`, light and dark.

## Specs

- **S1** Design source: "10 · Catálogo › Actividades" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (page "Actividades", artboards "Actividades · lista (interactiva)", "Actividades · sin actividades", "Nueva actividad", "Nueva actividad · se empalma", "Editar actividad · paso 1", "Editar actividad · paso 2, revisar", "Archivar actividad con inscritos", "Actividades · archivadas"), plus the canvas note "Actividades redesign, assumptions to confirm before building". No API change.
- **S2** (#367) Header "Actividades" / "La agenda del evento: competencias, talleres y sociales. Los pases se arman con estas actividades." and "Nueva actividad"; tabs "Activas N" / "Archivadas N" replace "Mostrar archivadas" (tab change resets the chip); "Buscar actividad"; chips Todas + each type with count > 0 in the tab ("Competencias", "Talleres", "Sociales"), the selected one kept.
- **S3** (#367) Day sections "Sábado 21 de noviembre" + "1 actividad" / "N actividades"; rows time (mono, "+N días" kept) | name + "Tipo · Sede" | "Sin inscritos" / "1 inscrito" / "N inscritos" | "Editar" (aria-label "Editar <nombre>") + icon Archivar (aria-label "Archivar <nombre>"); archived rows "Restaurar"; narrow width: time on its own line, inscritos hidden.
- **S4** (#367) Inscritos from the attendee-lists snapshot (confirmed + pending payment with access); social and archived rows show no count; a failed snapshot hides the column. Pases per activity from `pass-types`.
- **S5** (#367) Overlap pill "Mismo horario que <otra>": active, same day, same venue, overlapping times; informative.
- **S6** (#367) Success notice with "Cerrar aviso"; "Deshacer" after archive and restore: "Archivaste <nombre>.", "Restauraste <nombre>. Vuelve a aparecer en los pases que la incluyen.", "Creaste <nombre>. Agrégala a un pase para que se pueda vender.", "Guardaste los cambios de <nombre>.".
- **S7** (#367) Archive dialog "¿Archivar <nombre>?" / "Deja de aparecer en la venta y en los pases nuevos. Puedes restaurarla cuando quieras desde Archivadas.", primary "Archivar", warning "N personas ya están inscritas. Conservan su inscripción; avísales si la actividad ya no se hará." ("1 persona ya está inscrita"); restore without confirmation.
- **S8** (#367) Footer "Horas de Ciudad de México. El evento va del 21 al 22 de noviembre de 2026."; empty states "Aún no hay actividades" (event, with "Agregar la primera actividad" and the three type cards), "Ninguna actividad coincide con “…”" / "Revisa cómo se escribe o quita el filtro de tipo.", "No hay actividades archivadas" / "Cuando archives una actividad aparecerá aquí y podrás restaurarla.", Activas empty with "Nueva actividad"; loading, failure, reload and denied as today.
- **S9** (#368) Form: "Nombre" (placeholder "Ej. Breaking 1v1 Toprock", "Escribe el nombre de la actividad."), Tipo segmented ("Elige un tipo."), Día segmented from the event dates ("Sábado" / "21 de noviembre"; date field when the event has no dates), "Empieza" / "Termina" time inputs (step 5 min), "Sede"; "Dura 1 h." helper, "La hora de fin debe ser después del inicio.", "Escribe a qué hora empieza y termina."; "Termina otro día"; server window errors still marked.
- **S10** (#368) Overlap warning "Se empalma con <otra> (10:00–11:00) en la misma sede. Puedes guardarla así si es a propósito."; create saves directly with "Crear actividad".
- **S11** (#368) Edit: no version label; summary "N personas inscritas. Incluida en <pases>." / "Sin inscritos todavía." / "No está en ningún pase."; "Revisar cambios" disabled with "Sin cambios todavía."; step 2 in the same Modal "Editar actividad · paso 2 de 2" / "Revisa los cambios" (Nombre, Tipo, Horario "Sáb 21 nov, 10:00–11:00", Sede), "Volver a editar" keeps the values, "Guardar cambios", warning "N personas inscritas tenían el horario anterior. Avísales del cambio.".
- **S12** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width; docs updated when behavior changes.

## Tasks

| ID  | Specs      | Route  | Status  | Commit |
| --- | ---------- | ------ | ------- | ------ |
| T1  | S2–S5, S8  | inline | pending |        |
| T2  | S2–S8, S12 | inline | pending |        |
| T3  | S9–S11     | inline | pending |        |
| T4  | S9–S12     | inline | pending |        |

T1 = list model (pure), T2 = list screen, T3 = form model (pure), T4 = form and review step.

## Log

- **L1 (2026-10-24, user):** "Es un rediseño/mejora-completa para la sección de "Catálogo › Actividades", revisa y entiende por completo el nuevo diseño: https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-e4a475467edc Crea el issue necesario en GH (o más de uno de ser necesario) para cumplir por completo con lo que el nuevo diseño indica Una vez todo este listo comienza a trabajar, tienes acceso a mi navegador para que te asegures que la implementación queda lo más parecida posible al nuevo diseño. Comencemos!"
- **L2:** Checked the canvas note against the code. No endpoint returns inscritos per activity; the attendee-lists snapshot (`fetchAttendeeLists`) has per-registration access for active competitions and workshops only, so it gives the count (social and archived rows show none). `listPassTypes` returns each pass type's activities. The API allows activities that cross midnight (only end > start inside the event window), so "Termina otro día" stays. Deshacer only for archive/restore (one call with the returned version). The review warning uses "tenían" (plural agreement). Issues #367 (list) and #368 (form) created and added to #312. Route: inline for every task (one sequential chain).
