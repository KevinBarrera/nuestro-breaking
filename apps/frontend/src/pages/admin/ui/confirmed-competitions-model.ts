import type { AdminRegistrationFailure, HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import {
  competitionDraft,
  competitionsPayload,
  saleCompetitionPasses,
  saveCompetitionsFailure,
  type SaleCompetitionPass,
} from './sale-competitions-model';
import { reasonMaxLength } from './sale-complimentary-model';

// Changing the competitions of a confirmed registration (#170). The participant already paid, so
// the backend requires a reason and stores it in the `pass_selection_change` audit fact; the
// choices follow the sale's rules, and the backend stays the authority on both.

// The pass's competitions to edit, or null when it has no selectable competition (a saved one that
// is no longer selectable can only be unchecked, which is not worth an action) or the event's pass
// types or activities could not be read.
export function editableCompetitionPass(
  pass: HeldPass,
  passTypes: readonly CatalogPassType[] | null,
  activities: readonly CatalogActivity[] | null,
): SaleCompetitionPass | null {
  if (!passTypes || !activities) return null;
  const [editable] = saleCompetitionPasses([pass], passTypes, activities);
  return editable?.choices.some((choice) => choice.available) ? editable : null;
}

// The backend's reason limit, checked on the trimmed text before sending.
export function selectionReasonError(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (!trimmed) return 'Escribe el motivo del cambio.';
  if (trimmed.length > reasonMaxLength) return `Usa máximo ${reasonMaxLength} caracteres.`;
  return undefined;
}

export const selectionReasonHint = (reason: string) =>
  `${reason.trim().length} de ${reasonMaxLength} caracteres.`;

export type SelectionChangeReview =
  | { ok: true; activityIds: string[]; reason: string }
  | { ok: false; reasonError?: string; selectionError?: string };

// What "Guardar cambios" may send: a changed list the backend would accept and a valid reason.
// Every problem is reported at once, so the operator fixes them in one go.
export function reviewSelectionChange(
  pass: SaleCompetitionPass,
  draft: readonly string[],
  reason: string,
): SelectionChangeReview {
  const reasonError = selectionReasonError(reason);
  const { changed, blocked } = competitionDraft(pass, draft);
  const selectionError = changed
    ? (blocked ?? undefined)
    : 'Cambia al menos una competencia para guardar.';
  if (!reasonError && !selectionError)
    return { ok: true, activityIds: competitionsPayload(pass, draft), reason: reason.trim() };
  return {
    ok: false,
    ...(reasonError && { reasonError }),
    ...(selectionError && { selectionError }),
  };
}

const namesOf = (pass: SaleCompetitionPass, ids: readonly string[]) => {
  const names = pass.choices
    .filter((choice) => ids.includes(choice.activityId))
    .map((choice) => choice.name);
  return names.length > 0 ? names.join(', ') : 'Sin competencias';
};

// The operator checks the change and its reason before it is recorded.
export const selectionChangeConfirmation = (
  pass: SaleCompetitionPass,
  draft: readonly string[],
  reason: string,
) => ({
  title: `¿Cambiar las competencias de «${pass.name}»?`,
  consequence: `Antes: ${namesOf(pass, pass.saved)}. Después: ${namesOf(pass, draft)}. Motivo: ${reason.trim()}. El cambio quedará registrado con este motivo.`,
});

export type SelectionChangeFailure = { field: 'reason' | null; message: string; reload: boolean };

// A rejected reason goes under its field; anything else is the sale's save message.
export function selectionChangeFailure(failure: AdminRegistrationFailure): SelectionChangeFailure {
  if (failure.kind === 'invalid' && failure.fieldErrors.reason)
    return {
      field: 'reason',
      message: `Escribe un motivo de 1 a ${reasonMaxLength} caracteres.`,
      reload: false,
    };
  return { field: null, ...saveCompetitionsFailure(failure) };
}
