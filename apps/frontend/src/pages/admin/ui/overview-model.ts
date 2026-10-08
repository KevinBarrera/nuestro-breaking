import type { CatalogActivity, CatalogPassType, RequiredPassClass } from '@/entities/event-catalog';

// Pure derivations for the event overview, computed only from the catalog API responses.
const kindLabels: Record<string, string> = {
  battle: 'batallas',
  competition: 'competencias',
  workshop: 'talleres',
  social: 'sociales',
};

const requiredLabels: Record<RequiredPassClass, string> = {
  full: 'completo',
  general: 'general',
};

export type CatalogStat = { label: string; count: number };

// Active pass types first, then one entry per activity kind that has active activities.
export function catalogStats(
  activities: CatalogActivity[],
  passTypes: CatalogPassType[],
): CatalogStat[] {
  const byKind = new Map<string, number>();
  for (const activity of activities)
    if (activity.status === 'active')
      byKind.set(activity.kind, (byKind.get(activity.kind) ?? 0) + 1);
  const kinds = [...byKind]
    .map(([kind, count]) => ({ label: kindLabels[kind] ?? kind, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const activePasses = passTypes.filter((passType) => passType.status === 'active').length;
  return [{ label: 'pases activos', count: activePasses }, ...kinds];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Summarizes what a pass grants, counting only activities that are still active.
export function describeAccess(
  passType: CatalogPassType,
  activityById: Map<string, CatalogActivity>,
): string {
  const usable = passType.activities.filter(
    (entry) => activityById.get(entry.activityId)?.status === 'active',
  );
  const selectable = usable.filter((entry) => entry.access === 'selectable').length;
  const included = usable
    .filter((entry) => entry.access === 'included')
    .map((entry) => activityById.get(entry.activityId)?.name ?? '');
  const parts: string[] = [];
  if (selectable > 0) parts.push(`${plural(selectable, 'actividad', 'actividades')} a elegir`);
  if (included.length > 0)
    parts.push(
      included.length <= 2
        ? `Incluye ${included.join(' y ')}`
        : `${plural(included.length, 'actividad incluida', 'actividades incluidas')}`,
    );
  if (parts.length === 0) parts.push('Sin actividades');
  if (passType.requiresPassClass)
    parts.push(`Requiere pase ${requiredLabels[passType.requiresPassClass]}`);
  return parts.join(' · ');
}
