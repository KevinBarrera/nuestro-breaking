import type {
  AdminRegistrationFailure,
  CompetitorNumberAssignment,
  HeldCompetitorNumber,
} from '@/entities/admin-registration';
import { formatCompetitorNumber } from '@/shared/lib';

// The competitor number action of one competition check on the check-in screen (#377): an admin
// gives an eligible, confirmed registration that competition's next number, which also retires
// its current number there. `accessibleLabel` names the competition for the row's button.
export type CompetitorNumberAction = {
  label: string;
  accessibleLabel: string;
  pendingLabel: string;
  title: string;
  consequence: string;
};

export function competitorNumberAction(
  competition: string,
  current: number | null,
): CompetitorNumberAction {
  const next = 'Recibirá el siguiente número disponible de esta categoría';
  if (current === null)
    return {
      label: 'Asignar número',
      accessibleLabel: `Asignar número en ${competition}`,
      pendingLabel: 'Asignando…',
      title: `Asignar número en ${competition}`,
      consequence: `${next}.`,
    };
  const number = formatCompetitorNumber(current);
  return {
    label: 'Cambiar número',
    accessibleLabel: `Cambiar número en ${competition}`,
    pendingLabel: 'Cambiando…',
    title: `Cambiar el número ${number} de ${competition}`,
    consequence: `${next} y el ${number} ya no se le dará a nadie en esta categoría.`,
  };
}

export function competitorNumberSuccess(
  competition: string,
  {
    competitorNumber,
    previousCompetitorNumber,
  }: Pick<CompetitorNumberAssignment, 'competitorNumber' | 'previousCompetitorNumber'>,
): string {
  const number = formatCompetitorNumber(competitorNumber);
  return previousCompetitorNumber === null
    ? `Número ${number} asignado en ${competition}.`
    : `Número de ${competition} cambiado de ${formatCompetitorNumber(previousCompetitorNumber)} a ${number}.`;
}

export function competitorNumberFailureText(failure: AdminRegistrationFailure): string {
  if (failure.kind === 'rule' && failure.code === 'competitor_number_not_eligible')
    return 'Esta persona no tiene esta categoría en su pase; revisa su inscripción en coordinación.';
  if (failure.kind === 'rule' && failure.code === 'competitor_number_not_confirmed')
    return 'Su inscripción aún no está confirmada; confirma su pago antes de darle número.';
  if (failure.kind === 'not_found')
    return 'No encontramos esta inscripción; actualiza la página y vuelve a buscarla.';
  if (failure.kind === 'unauthorized' || failure.kind === 'forbidden')
    return 'No tienes acceso para dar números en este evento; consulta al responsable.';
  if (failure.kind === 'unknown')
    return 'No supimos si se guardó el número; actualiza la página para revisarlo antes de intentar otra vez.';
  return 'No se pudo guardar el número; inténtalo de nuevo en un momento.';
}

// The registration detail's numbers (#377), each with its competition's name from the event's
// catalog, or a neutral "Categoría" when the catalog could not be read or no longer lists it.
export function competitorNumberLines(
  competitorNumbers: HeldCompetitorNumber[],
  activities: readonly { id: string; name: string }[] | null,
): { activityId: string; competition: string; number: string }[] {
  const names = new Map((activities ?? []).map((activity) => [activity.id, activity.name]));
  return competitorNumbers.map(({ activityId, competitorNumber }) => ({
    activityId,
    competition: names.get(activityId) ?? 'Categoría',
    number: formatCompetitorNumber(competitorNumber),
  }));
}
