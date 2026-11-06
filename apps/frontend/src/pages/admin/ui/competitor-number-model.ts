import type {
  AdminRegistrationFailure,
  CompetitorNumberAssignment,
} from '@/entities/admin-registration';
import { formatCompetitorNumber } from '@/shared/lib';

// The competitor number action of the check-in screen (#377): an admin gives an eligible,
// confirmed registration the event's next number, which also retires its current one.
export type CompetitorNumberAction = {
  label: string;
  pendingLabel: string;
  title: string;
  consequence: string;
};

export function competitorNumberAction(current: number | null): CompetitorNumberAction {
  const next = 'Recibirá el siguiente número disponible del evento';
  if (current === null)
    return {
      label: 'Asignar número',
      pendingLabel: 'Asignando…',
      title: 'Asignar número',
      consequence: `${next}.`,
    };
  const number = formatCompetitorNumber(current);
  return {
    label: 'Cambiar número',
    pendingLabel: 'Cambiando…',
    title: `Cambiar el número ${number}`,
    consequence: `${next} y el ${number} ya no se le dará a nadie.`,
  };
}

export function competitorNumberSuccess({
  competitorNumber,
  previousCompetitorNumber,
}: Pick<CompetitorNumberAssignment, 'competitorNumber' | 'previousCompetitorNumber'>): string {
  const number = formatCompetitorNumber(competitorNumber);
  return previousCompetitorNumber === null
    ? `Número ${number} asignado.`
    : `Número cambiado de ${formatCompetitorNumber(previousCompetitorNumber)} a ${number}.`;
}

export function competitorNumberFailureText(failure: AdminRegistrationFailure): string {
  if (failure.kind === 'rule' && failure.code === 'competitor_number_not_eligible')
    return 'Esta persona no tiene una competencia en su pase; revisa su inscripción en coordinación.';
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
