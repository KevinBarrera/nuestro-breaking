import type { AdminRegistrationFailure, HeldPass } from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';

// Competitions of each held pass in the in-person sale (#105). The backend accepts only active
// activities with `selectable` access on the pass's type and replaces the whole list on save, so
// the screen keeps a draft and always sends the full desired set; the backend stays the authority.

export type SaleCompetitionChoice = {
  activityId: string;
  name: string;
  // False for a saved selection the backend would no longer accept: it can only be unchecked.
  available: boolean;
};

export type SaleCompetitionPass = {
  registrationPassId: string;
  name: string;
  saved: string[];
  choices: SaleCompetitionChoice[];
};

const unavailableName = 'Competencia no disponible';

const byStart = (left: CatalogActivity, right: CatalogActivity) =>
  left.startsAt.localeCompare(right.startsAt) || left.name.localeCompare(right.name, 'es');

// One entry per held pass that has something to choose or keep, in held order. Selections are
// not re-validated on read, so a saved one that is no longer selectable is listed after the rest.
export function saleCompetitionPasses(
  held: readonly HeldPass[],
  passTypes: readonly CatalogPassType[],
  activities: readonly CatalogActivity[],
): SaleCompetitionPass[] {
  const sorted = [...activities].sort(byStart);
  return held.flatMap((pass) => {
    const access = passTypes.find((passType) => passType.id === pass.passTypeId)?.activities ?? [];
    const selectable = new Set(
      access.filter((link) => link.access === 'selectable').map((link) => link.activityId),
    );
    const available = sorted
      .filter((activity) => activity.status === 'active' && selectable.has(activity.id))
      .map((activity) => ({ activityId: activity.id, name: activity.name, available: true }));
    const stale = pass.selections
      .filter((id) => !available.some((choice) => choice.activityId === id))
      .map((id) => ({
        activityId: id,
        name: activities.find((activity) => activity.id === id)?.name ?? unavailableName,
        available: false,
      }));
    const choices = [...available, ...stale];
    if (choices.length === 0) return [];
    return [
      {
        registrationPassId: pass.registrationPassId,
        name: pass.name,
        saved: pass.selections,
        choices,
      },
    ];
  });
}

export const toggleCompetition = (draft: readonly string[], activityId: string): string[] =>
  draft.includes(activityId) ? draft.filter((id) => id !== activityId) : [...draft, activityId];

const sameSet = (left: readonly string[], right: readonly string[]) => {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((id) => b.has(id));
};

// Unsaved checks of each held pass by `registrationPassId`. An entry exists only after the
// operator changes a pass, so refreshed entitlements never rewrite or drop it.
export type CompetitionDrafts = Readonly<Record<string, readonly string[]>>;

export const effectiveDraft = (drafts: CompetitionDrafts, pass: SaleCompetitionPass) =>
  drafts[pass.registrationPassId] ?? pass.saved;

// Records the pass's next draft; null (after a save) or a draft back at the saved list drops it.
export function withDraft(
  drafts: CompetitionDrafts,
  pass: SaleCompetitionPass,
  next: readonly string[] | null,
): CompetitionDrafts {
  const updated = { ...drafts };
  if (next === null || sameSet(next, pass.saved)) delete updated[pass.registrationPassId];
  else updated[pass.registrationPassId] = next;
  return updated;
}

// Saving needs a change and only activities the backend would accept.
export function competitionDraft(pass: SaleCompetitionPass, draft: readonly string[]) {
  const changed = !sameSet(draft, pass.saved);
  const keepsUnavailable = pass.choices.some(
    (choice) => !choice.available && draft.includes(choice.activityId),
  );
  const blocked = keepsUnavailable
    ? 'Desmarca las competencias que ya no están disponibles para guardar.'
    : null;
  return { changed, blocked, canSave: changed && blocked === null };
}

// The PUT body's `activityIds`: the whole desired list, once each, in the order shown.
export const competitionsPayload = (pass: SaleCompetitionPass, draft: readonly string[]) =>
  pass.choices.map((choice) => choice.activityId).filter((id) => draft.includes(id));

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

// The inline message of a failed save. `reload` offers "Recargar": a rule answer means the
// screen is stale, and a lost answer may have saved the list, so it is never retried blindly.
export function saveCompetitionsFailure(failure: AdminRegistrationFailure): {
  message: string;
  reload: boolean;
} {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        message: 'Sin acceso: tu cuenta no puede cambiar competencias en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        message:
          'No pudimos confirmar si se guardaron las competencias. Recarga la inscripción antes de intentarlo de nuevo.',
        reload: true,
      };
    case 'rule':
      if (failure.code === 'invalid_activity_selection')
        return {
          message:
            'Alguna competencia ya no está disponible para este pase. Recarga para ver las competencias actuales.',
          reload: true,
        };
      if (failure.code === 'registration_voided')
        return {
          message: 'Esta inscripción está anulada. Recarga para ver su estado.',
          reload: true,
        };
      return { message: staleMessage, reload: true };
    case 'not_found':
      return {
        message: 'No encontramos este pase o la inscripción. Recarga para ver los datos actuales.',
        reload: true,
      };
    default:
      return { message: 'No pudimos guardar las competencias. Intenta de nuevo.', reload: false };
  }
}
