# Check-in redesign

Objective: the admin Check-in screen follows the "5 · Check-in" design (#336, epic #312): default list, live search, filters and the detail in a modal.
Branches: chained from `dev`, one per task (`feat/336-0N-…`). Delivery: chained PRs per slice.
Test runner: Vitest for pure logic, Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice. Visual check in Chrome at `localhost:5173`, light and dark.

## Specs

- **S1** Design source: "5 · Check-in" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (artboards "Check-in · lista", "Check-in · pase general", "Check-in · pase con actividades", "Check-in · pago por revisar", "Check-in · sin registros").
- **S2** Header "Check-in" / "Busca a la persona, abre su ficha y registra su entrada." with the progress card ("Entradas registradas" / "Entradas a …", "N de M", bar) following the activity filter.
- **S3** Default list from the attendee-lists snapshot, "Por entrar" by default; chips "Por entrar", "Ya entraron", "Todas" with counts; "Actividad" select ("Todas las actividades", "Entrada al evento (pase general)", each activity) driving counts and progress.
- **S4** Live search "Nombre, alias o folio" (folio with or without the hyphen), no Buscar button; with a query the chips are ignored ("Buscando en todas las inscripciones, hayan entrado o no."), "N resultados", Enter opens the only result ("Presiona Enter para abrirla"), "Borrar búsqueda".
- **S5** Rows: name + alias, folio, pass, status pill ("Por entrar", "Entró HH:MM", "N de M actividades", "Completo", "Pago por revisar"), chevron; folio and pass hidden at narrow width; empty-result copy from the design.
- **S6** Detail in `Modal`: initials, name, alias · folio, registration pill, pass; general pass card ("Aún no entra" / "Registrar entrada", "Entró a las HH:MM" / "Ya está adentro. No vuelvas a registrar su entrada.", "Su pase es de entrada general: solo se registra la entrada al evento."); activities list ("Actividades de sus pases", "N de M registradas", "Su pase no incluye entrada general. Registra cada actividad cuando llegue a ella."); pago por revisar warning ("No registres su entrada todavía", "Ir a Pagos por revisar") without actions; success line "… registrada a las HH:MM."; "Buscar a otra persona" when finished.
- **S7** Empty event "Aún no hay a quién registrar" with "Nueva inscripción", "Revisar la venta en línea" and the backup lists tip; footer note "Si no puedes verificar a alguien, no registres la entrada…".
- **S8** Adaptations (issue #336): snapshot read from `GET attendee-lists` and re-read after each check-in; `generalEntryOnly` derived from pass classes; search by email and receipt dropped; pending payments show "Sin folio"; confirmed registrations without actions stay findable with the coordination note; existing POST endpoints and messages.
- **S9** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width; docs updated.

## Tasks

| ID  | Specs          | Route  | Status | Commit      |
| --- | -------------- | ------ | ------ | ----------- |
| T1  | S3, S4, S5, S8 | inline | done   | 687adb1     |
| T2  | S2–S9          | inline | done   | (T2 commit) |

## Log

- **L1 (2026-10-23, user):** "Es un rediseño/mejora-completa para la sección de "Check-in", revisa y entiende por completo el nuevo diseño: https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-6e41585e6db5 Crea el issue necesario en GH (o más de uno de ser necesario) para cumplir por completo con lo que el nuevo diseño indica Una vez todo este listo comienza a trabajar, tienes acceso a mi navegador para que te asegures que la implementación queda lo más parecida posible al nuevo diseño. Comencemos!"
- **L2:** Issue #336 created and linked in #312. API check: `GET /participants` needs a 2+ character query (max 50 rows), so the default list reads the unpaginated `attendee-lists` snapshot (#65), which carries pass classes, event and activity check-in times. `pending_payment` exists and has no folio. Adaptations recorded as S8. T1 is the pure roster model; T2 the screen, modal, e2e and docs.
- **L3:** T1 (`feat/336-01-check-in-model`): `check-in-roster-model.ts` builds the roster from the snapshot (general-entry-only gets "Entrada al evento", others their activities by name; pass names joined, "Sin pase"), plus search (accents and case ignored, folio alphanumeric), status and activity filters, counts, progress (pending payments excluded), row status, activity options, initials. Confirmed registrations without checks stay in the "all activities" pool with "Consultar coordinación" so they remain findable. 11 Vitest cases.
- **L4:** T2 (`feat/336-02-check-in-screen`): `admin-check-in-page.tsx` loads the snapshot (rejects a foreign `event.id`), `check-in-list.tsx` (header progress, autofocused search, chips, `Select` variant `filter` with `selectedLabel`, rows by container query, 100 rows per page with "Mostrar más"), `check-in-dialog.tsx` on `Modal` with new `layout="card"`, `size="xl"`, `leading` and `closeLabel` (defaults unchanged; card opens near the top from `sm`). `admin-check-in-model.ts` keeps only admission reading and notices; success now says "… registrada a las HH:MM." from the refreshed snapshot. Event-name eyebrow dropped (not in the artboard). Single-card button keeps visible "Registrar entrada" with an accessible name naming the target. "Buscar a otra persona" refocuses the search one frame after the dialog restores focus. Progress fill uses `bg-heading` (the nav-active token vanished in dark). Checked in Chrome against the artboards: list, pase general, pase con actividades, search by folio without hyphen + Enter, activity filter, dark mode, narrow width (no overflow); no real check-in was posted on the local data. `admin-check-in.spec.ts` rewritten (17 tests), live spec and sweep preparation updated; live spec green against a disposable PostgreSQL. Docs: `frontend-architecture.md`, `operational-check-in.md`, `attendee-lists.md`.
