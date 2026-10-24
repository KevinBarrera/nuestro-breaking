# Payments review redesign

Objective: the admin "Pagos por revisar" screen follows the "6 · Pagos por revisar" design (#340, epic #312): totals, case chips, one collapsible card per case with its action and table, and the "Todo en orden" empty state.
Branches: chained from `dev`, one per task (`feat/340-0N-…`). Delivery: chained PRs per slice.
Test runner: Vitest for pure logic, Playwright (`apps/frontend/e2e`) for flows; `pnpm verify:pr` at each slice. Visual check in Chrome at `localhost:5173`, light and dark.

## Specs

- **S1** Design source: "6 · Pagos por revisar" on https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf (artboards "Pagos por revisar · con pagos", "Pagos por revisar · muchos pagos (casos colapsados)", "Pagos por revisar · sin pagos").
- **S2** Header "Pagos por revisar" / "Pagos de Mercado Pago que el sistema guardó pero no pudo aplicar solo. Cada caso dice qué hacer." with a totals card ("Pagos", "Monto en total") when there are payments; info note "Esta pantalla solo informa. Los reembolsos se hacen directamente en Mercado Pago; aquí no se cambia nada. Busca cada pago por su número de Mercado Pago."
- **S3** Chips "Filtrar por caso": "Todos los casos" plus present cases ("Pagó dos veces", "Después del evento", "Pago de más", "Inscripción anulada") with counts; a chosen case shows only that case.
- **S4** One card per case in fixed order: icon, title, "N pago(s)", case amount, chevron toggle (`aria-expanded`); reason and "Qué hacer" with the design copy; table "Persona" (name + folio / "Sin folio"), "Inscripción" (pill), "Recibido", "Monto", "Pago en Mercado Pago" (number + copy button, announced "Número de pago … copiado.").
- **S5** More than 8 payments: cases start closed; "Abrir todos los casos" / "Cerrar todos los casos" when more than one case is visible.
- **S6** Narrow width: case head stacks, column headers hide, rows show labeled cells in two columns.
- **S7** Empty state "Todo en orden" / "No hay pagos por revisar. Si un pago de Mercado Pago no se puede aplicar solo, aparece aquí con lo que debes hacer." without totals or chips.
- **S8** Adaptations (issue #340): existing `GET flagged-payments`, client-side grouping and totals; event-name line dropped; loading and failure states unchanged.
- **S9** `--nb-*` tokens in both themes, 44px targets, 4.5:1 contrast, no horizontal page scroll at phone width; docs updated.

## Tasks

| ID  | Specs          | Route  | Status | Commit  |
| --- | -------------- | ------ | ------ | ------- |
| T1  | S3, S4, S5, S8 | inline | done   | 487ae85 |
| T2  | S2–S9          | inline | done   | 73c283a |

## Log

- **L1 (2026-10-23, user):** "Es un rediseño/mejora-completa para la sección de "Pagos por revisar", revisa y entiende por completo el nuevo diseño: https://claude.ai/artifact/EQBVYtnzLp7u9BX8caRxYf#page-7c1ced7d753b Crea el issue necesario en GH (o más de uno de ser necesario) para cumplir por completo con lo que el nuevo diseño indica Una vez todo este listo comienza a trabajar, tienes acceso a mi navegador para que te asegures que la implementación queda lo más parecida posible al nuevo diseño. Comencemos!"
- **L2:** Issue #340 created and linked in #312. The flagged-payments response already carries everything the design shows, so no backend work. T1 is the pure model (case copy, grouping, chips, totals, collapse rule); T2 the screen, e2e and docs.
- **L3:** T1 (`feat/340-01-payments-review-model`): `payments-review-model.ts` gains the chip label and the design copy per case, `reviewCases` (fixed order, list order inside), `caseChips`, `visibleCases`, `totalAmountCents`, `paymentCountText`, `startsCollapsed` (> 8) and `statusTone`; `reasonSummary` is replaced. The old screen was adapted minimally so the slice builds. 10 Vitest cases.
- **L4:** T2 (`feat/340-02-payments-review-screen`): the screen rewritten from the artboards: totals `dl`, info note, chips (`aria-pressed`, check icon), one card per case (icon on `chip-selected` tokens, title button with `aria-expanded`/`aria-controls`, "Qué hacer" box) and a `role="table"` grid per case (column header row hidden and labeled cells below `@3xl`), status pills reused from `team-list.tsx`, copy per payment number with an announced status and a failure line. Event-name line dropped (not in the artboard). Checked in Chrome against the artboards with a temporary, uncommitted mock of the API (con pagos, muchos, vacío, chip filter, copy, dark theme, narrow width): the only gap found (a tall column header row) was fixed. `admin-payments-review.spec.ts` rewritten (8 tests), the sweep wait in `support/admin-mocks.ts` updated; the accessibility and phone-width sweeps for the screen pass locally. Docs: `frontend-architecture.md`, `contracts/flagged-payments.md`.
- **L5:** Native review: T1 (readability, reliability) granted and approved, 3 suggestions (named threshold, `caseChips` expects unfiltered cases, no test for a chip whose case is absent); T2 granted and approved, 2 warnings on the sweep wait relying on the fixture (now explained in a comment) and 1 suggestion (e2e fixture lacks the duplicate and after-event cases; the model tests cover their copy). The follow-up comment commit was assessed `under_budget`. `verify:pr` green (570 Playwright tests).
