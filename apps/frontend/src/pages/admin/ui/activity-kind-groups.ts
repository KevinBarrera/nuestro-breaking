import { activityKinds, isActivityKind } from '@/entities/event-catalog';
import { activityKindPluralLabels } from './catalog-copy';

export type KindGroup<T> = { label: string; items: T[] };

// Items grouped by activity kind (#410): competitions, workshops and social activities in the
// catalog order, each group keeping the order it was given. "Categoría" means a competition only
// (#385), so a list that can hold any kind is split instead of called "Categorías". An unknown kind
// goes last under a neutral label; empty kinds are left out.
export function groupByKind<T>(items: readonly T[], kindOf: (item: T) => string): KindGroup<T>[] {
  const known = activityKinds.map((kind) => ({
    label: activityKindPluralLabels[kind],
    items: items.filter((item) => kindOf(item) === kind),
  }));
  const others = items.filter((item) => !isActivityKind(kindOf(item)));
  return [...known, { label: 'Otras actividades', items: others }].filter(
    (group) => group.items.length > 0,
  );
}
