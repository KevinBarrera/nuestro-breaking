import type { HeldPass } from '@/entities/admin-registration';
import {
  formatMxn,
  type ActivityKind,
  type CatalogActivity,
  type CatalogPassType,
} from '@/entities/event-catalog';

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

export type ActivityGroup = {
  label: string;
  names: string[];
  // Shown instead of the chips when the group is empty.
  empty?: string;
};

// Kinds in display order, with the group label for each access (#405). "Categoría" means a
// competition only (#385), so workshops and social activities get their own labels.
const kindGroups: readonly { kind: ActivityKind; included: string; chosen: string }[] = [
  { kind: 'competition', included: 'Categorías incluidas', chosen: 'Categorías elegidas' },
  { kind: 'workshop', included: 'Talleres incluidos', chosen: 'Talleres elegidos' },
  { kind: 'social', included: 'Sociales incluidas', chosen: 'Sociales elegidas' },
];
// Chosen activities whose kind is unknown, and the empty choice: neutral wording.
const otherChosen = 'Actividades elegidas';

// The activities of a held pass as chip groups (#345, #405): by kind, then the active ones its type
// includes (by start) apart from the chosen ones, since included ones are access, not a choice
// (#277). A pass with something to choose and nothing chosen says so; null hides the block.
// Without the activities only the number chosen is known. Like `passCompetitionLines`, an unknown
// pass type keeps its selections.
export function heldPassActivities(
  pass: HeldPass,
  passTypes: readonly CatalogPassType[] | null,
  activities: readonly CatalogActivity[] | null,
): { groups: ActivityGroup[] } | { text: string } | null {
  const passType = passTypes?.find((candidate) => candidate.id === pass.passTypeId);
  const links = passType?.activities ?? [];
  const choosable =
    !passType || pass.selections.length > 0 || links.some((link) => link.access === 'selectable');
  const noneChosen: ActivityGroup = {
    label: otherChosen,
    names: [],
    empty: 'Sin actividades elegidas.',
  };
  if (!activities) {
    const count = pass.selections.length;
    if (count > 0) return { text: count === 1 ? '1 actividad' : `${count} actividades` };
    return choosable ? { groups: [noneChosen] } : null;
  }
  const includedIds = new Set(
    links.filter((link) => link.access === 'included').map((link) => link.activityId),
  );
  const included = activities
    .filter((activity) => activity.status === 'active' && includedIds.has(activity.id))
    .sort(byStart);
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const chosen = pass.selections.map((id) => byId.get(id));
  const namesOf = (list: readonly (CatalogActivity | undefined)[], kind: ActivityKind) =>
    list.flatMap((activity) => (activity?.kind === kind ? [activity.name] : []));
  const groups: ActivityGroup[] = kindGroups.flatMap(({ kind, ...labels }) =>
    [
      { label: labels.included, names: namesOf(included, kind) },
      { label: labels.chosen, names: namesOf(chosen, kind) },
    ].filter((group) => group.names.length > 0),
  );
  const known = new Set<string>(kindGroups.map(({ kind }) => kind));
  const others = chosen.flatMap((activity) =>
    activity && known.has(activity.kind) ? [] : [activity?.name ?? 'Actividad no disponible'],
  );
  if (others.length > 0) groups.push({ label: otherChosen, names: others });
  if (choosable && pass.selections.length === 0) groups.push(noneChosen);
  return groups.length > 0 ? { groups } : null;
}
