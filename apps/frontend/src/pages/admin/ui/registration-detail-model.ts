import type { HeldPass } from '@/entities/admin-registration';
import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';

// Inscripción detail (#345): copy for the header and the summary strip.

export const akaLine = (stageName: string | null) => (stageName ? `AKA ${stageName}` : 'Sin AKA');

export type CashDifference = {
  tone: 'success' | 'warning';
  // Under "Cobrado en efectivo" in the summary strip.
  short: string;
  // The notice in the "Pago en efectivo" card; null when the cash matches.
  notice: string | null;
};

// Cash charged against the pass total. A different amount is allowed (#104), so it is explained,
// never blocked.
export function cashDifference(totalCents: number, amountCents: number): CashDifference {
  const difference = amountCents - totalCents;
  if (difference === 0) return { tone: 'success', short: 'Coincide con el total', notice: null };
  const amount = formatMxn(Math.abs(difference));
  const total = formatMxn(totalCents);
  return difference > 0
    ? {
        tone: 'warning',
        short: `Cobrado ${amount} de más`,
        notice: `Se cobraron ${amount} más que el total de los pases (${total}). Si fue un error de captura, corrige el pago.`,
      }
    : {
        tone: 'warning',
        short: `Faltan ${amount}`,
        notice: `Faltan ${amount} para cubrir el total de los pases (${total}). Si fue un error de captura, corrige el pago.`,
      };
}

const byStart = (left: CatalogActivity, right: CatalogActivity) =>
  left.startsAt.localeCompare(right.startsAt) || left.name.localeCompare(right.name, 'es');

// The competitions of a held pass as chips (#345): the active ones its type includes (by start)
// apart from the chosen ones, since included ones are access, not a choice (#277). `chosen` is null
// when the pass has nothing to choose; null hides the block. Without the activities only the
// number chosen is known. Like `passCompetitionLines`, an unknown pass type keeps its selections.
export function heldPassCompetitions(
  pass: HeldPass,
  passTypes: readonly CatalogPassType[] | null,
  activities: readonly CatalogActivity[] | null,
): { included: string[]; chosen: string[] | null } | { text: string } | null {
  const passType = passTypes?.find((candidate) => candidate.id === pass.passTypeId);
  const links = passType?.activities ?? [];
  const choosable =
    !passType || pass.selections.length > 0 || links.some((link) => link.access === 'selectable');
  if (!activities) {
    const count = pass.selections.length;
    if (count > 0) return { text: count === 1 ? '1 competencia' : `${count} competencias` };
    return choosable ? { included: [], chosen: [] } : null;
  }
  const includedIds = new Set(
    links.filter((link) => link.access === 'included').map((link) => link.activityId),
  );
  const included = activities
    .filter(
      (activity) =>
        activity.kind === 'competition' &&
        activity.status === 'active' &&
        includedIds.has(activity.id),
    )
    .sort(byStart)
    .map((activity) => activity.name);
  const names = new Map(activities.map((activity) => [activity.id, activity.name]));
  const chosen = choosable
    ? pass.selections.map((id) => names.get(id) ?? 'Competencia no disponible')
    : null;
  if (included.length === 0 && chosen === null) return null;
  return { included, chosen };
}
