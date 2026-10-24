import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  DisciplineSwapInput,
  HeldPass,
  RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';
import type { ChangeRow } from '@/shared/ui';
import { selectionReasonError } from './confirmed-competitions-model';
import { selectionSummary } from './sale-cash-model';
import { saleCompetitionPasses, type SaleCompetitionChoice } from './sale-competitions-model';
import { reasonMaxLength } from './sale-complimentary-model';

// Swapping a registration's only full pass for another discipline (#104): another active full
// pass of the event whose current price equals the held one's, with that pass's competitions and
// a required reason that goes to the `registration_discipline_swap` audit fact. The amount and any
// payment stay as they were. The backend checks every rule again, including the entry check-in the
// screen cannot see, and stays the authority.

const fullPasses = (passes: readonly HeldPass[]) =>
  passes.filter((pass) => pass.passClass === 'full');

// Pending and confirmed registrations, online or in person, holding exactly one full pass.
export const canSwapDiscipline = ({ registration, passes }: RegistrationEntitlements): boolean =>
  registration.status !== 'voided' && fullPasses(passes).length === 1;

// The held full pass the swap replaces, or null when there is not exactly one.
export const swapSourcePass = ({ passes }: RegistrationEntitlements): HeldPass | null => {
  const full = fullPasses(passes);
  return full.length === 1 ? full[0] : null;
};

export type SwapSource = { name: string; priceCents: number; selected: string | null };

export type SwapTarget = {
  passTypeId: string;
  name: string;
  priceCents: number;
  choices: SaleCompetitionChoice[];
};

export type SwapOptions =
  | { status: 'unavailable' }
  | { status: 'none'; message: string }
  | { status: 'ready'; from: SwapSource; targets: SwapTarget[] };

// The passes the held one can become, compared by current catalog price (the held pass keeps the
// price it was charged). Each target's choices are its active selectable competitions, as in the
// competitions editor. `unavailable` when the catalog could not be read or no longer lists the
// held pass type.
export function disciplineSwapOptions(
  held: HeldPass,
  passTypes: readonly CatalogPassType[] | null,
  activities: readonly CatalogActivity[] | null,
): SwapOptions {
  const current = passTypes?.find((passType) => passType.id === held.passTypeId);
  if (!passTypes || !activities || !current) return { status: 'unavailable' };
  const targets = passTypes
    .filter(
      (passType) =>
        passType.id !== current.id &&
        passType.passClass === 'full' &&
        passType.status === 'active' &&
        passType.priceCents === current.priceCents,
    )
    .map((passType) => {
      // The target's choices as the editor builds them for a held pass with nothing saved yet.
      const [editable] = saleCompetitionPasses(
        [{ ...held, passTypeId: passType.id, name: passType.name, selections: [] }],
        passTypes,
        activities,
      );
      return {
        passTypeId: passType.id,
        name: passType.name,
        priceCents: passType.priceCents,
        choices: editable?.choices ?? [],
      };
    });
  if (targets.length === 0)
    return {
      status: 'none',
      message: `Ningún otro pase completo activo cuesta lo mismo que «${current.name}» (${formatMxn(current.priceCents)}). El cambio de disciplina solo se hace entre pases del mismo precio actual.`,
    };
  const from = {
    name: held.name,
    priceCents: current.priceCents,
    selected: held.selections.length > 0 ? selectionSummary(held.selections, activities) : null,
  };
  return { status: 'ready', from, targets };
}

// The reason limits and messages of the confirmed competitions editor (#170).
export const swapReasonError = selectionReasonError;

export const swapReasonHint = (reason: string) =>
  `Queda en el historial. ${reason.trim().length} de ${reasonMaxLength} caracteres.`;

const targetRequired = 'Elige el pase al que cambia.';

export type SwapField = 'toPassTypeId' | 'reason';
export type SwapErrors = Partial<Record<SwapField, string>>;

export type SwapReview =
  { ok: true; input: DisciplineSwapInput } | { ok: false; errors: SwapErrors };

// What "Revisar cambio" may send. Every problem is reported at once; no competition is a valid
// choice, as it is for a held pass.
export function reviewDisciplineSwap(
  target: SwapTarget | null,
  draft: readonly string[],
  reason: string,
): SwapReview {
  const errors: SwapErrors = {};
  if (!target) errors.toPassTypeId = targetRequired;
  const reasonError = swapReasonError(reason);
  if (reasonError) errors.reason = reasonError;
  if (!target || reasonError) return { ok: false, errors };
  return {
    ok: true,
    input: {
      toPassTypeId: target.passTypeId,
      // The whole list, once each, in the order shown, as the competitions editor sends it.
      activityIds: target.choices
        .map((choice) => choice.activityId)
        .filter((id) => draft.includes(id)),
      reason: reason.trim(),
    },
  };
}

const namesOf = (target: SwapTarget, ids: readonly string[]) => {
  const names = target.choices
    .filter((choice) => ids.includes(choice.activityId))
    .map((choice) => choice.name);
  return names.length > 0 ? names.join(', ') : 'Ninguna';
};

// The review step's "Antes / Después" rows (#345): the pass and its competitions, always both.
export const disciplineSwapRows = (
  from: SwapSource,
  target: SwapTarget,
  draft: readonly string[],
): ChangeRow[] => [
  { key: 'pass', label: 'Pase', before: from.name, after: target.name },
  {
    key: 'competitions',
    label: 'Competencias',
    before: from.selected ?? 'Ninguna',
    after: namesOf(target, draft),
  },
];

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const staleRuleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_voided:
    'Esta inscripción se anuló y ya no admite cambios. Recarga para ver su estado.',
  discipline_swap_single_full_pass_required:
    'La inscripción ya no tiene un solo pase completo. Recarga para ver sus pases.',
  discipline_swap_invalid_target:
    'Ese pase ya no está disponible para el cambio. Recarga para ver los pases actuales.',
  discipline_swap_price_mismatch:
    'Los precios de los pases cambiaron y ya no coinciden. Recarga para ver los pases actuales.',
  invalid_activity_selection:
    'Alguna competencia ya no está disponible para ese pase. Recarga para ver las competencias actuales.',
};

export type SwapFailure = { fields: SwapErrors; message: string; reload: boolean };

// The message of a failed swap. Stale data and a lost answer (which may have saved the swap) only
// offer "Recargar", so they are never retried blindly. A check-in is not on this screen, so a
// reload would not explain it: its message stays in the form.
export function disciplineSwapFailure(failure: AdminRegistrationFailure): SwapFailure {
  const plain = (message: string, reload = false): SwapFailure => ({ fields: {}, message, reload });
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return plain('Sin acceso: tu cuenta no puede cambiar disciplinas en este evento.');
    case 'unknown':
      return plain(
        'No pudimos confirmar si se cambió la disciplina. Recarga la inscripción antes de intentarlo de nuevo.',
        true,
      );
    case 'rule':
      if (failure.code === 'discipline_swap_checked_in')
        return plain(
          'Esta persona ya registró su entrada al evento, así que su disciplina ya no se puede cambiar.',
        );
      return plain(staleRuleMessages[failure.code] ?? staleMessage, true);
    case 'not_found':
      return plain(
        'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
        true,
      );
    case 'invalid': {
      const fields: SwapErrors = {};
      if (failure.fieldErrors.toPassTypeId) fields.toPassTypeId = targetRequired;
      if (failure.fieldErrors.reason)
        fields.reason = `Escribe un motivo de 1 a ${reasonMaxLength} caracteres.`;
      const mapped = Object.keys(fields).length;
      const message =
        mapped > 0 && mapped === Object.keys(failure.fieldErrors).length
          ? 'Revisa los datos marcados.'
          : 'No pudimos cambiar la disciplina. Revisa los datos e intenta de nuevo.';
      return { fields, message, reload: false };
    }
    default:
      return plain('No pudimos cambiar la disciplina. Intenta de nuevo.');
  }
}
