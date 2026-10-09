import type { ActivityAccess, CatalogActivity, PassTypeActivity } from '@/entities/event-catalog';
import { activityKindLabel } from './catalog-copy';

// What a pass grants for one activity; 'none' is the absence of an access link.
export type AccessChoice = ActivityAccess | 'none';
export type AccessChoices = Record<string, AccessChoice>;
export type AccessGroup = { kind: string; label: string; activities: CatalogActivity[] };

// The backend only links active activities, so only those are listed. Groups follow the
// Spanish kind label (as in the agenda filters); inside a group, start time then name.
export function accessGroups(activities: CatalogActivity[]): AccessGroup[] {
  const byKind = new Map<string, CatalogActivity[]>();
  for (const activity of activities) {
    if (activity.status !== 'active') continue;
    byKind.set(activity.kind, [...(byKind.get(activity.kind) ?? []), activity]);
  }
  return [...byKind]
    .map(([kind, entries]) => ({
      kind,
      label: activityKindLabel(kind),
      activities: entries.sort(
        (left, right) =>
          Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
          left.name.localeCompare(right.name, 'es'),
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

export const savedChoices = (links: PassTypeActivity[]): AccessChoices =>
  Object.fromEntries(links.map((link) => [link.activityId, link.access]));

// The whole desired list for the listed activities: unlisted (archived) links are left out,
// because the backend rejects them, and 'none' sends nothing.
export function accessList(groups: AccessGroup[], choices: AccessChoices): PassTypeActivity[] {
  return groups.flatMap((group) =>
    group.activities.flatMap((activity) => {
      const access = choices[activity.id] ?? 'none';
      return access === 'none' ? [] : [{ activityId: activity.id, access }];
    }),
  );
}

// Saved links that a save would drop because their activity is no longer listed.
export function droppedLinks(links: PassTypeActivity[], groups: AccessGroup[]) {
  const listed = new Set(groups.flatMap((group) => group.activities.map((entry) => entry.id)));
  return links.filter((link) => !listed.has(link.activityId)).length;
}

export type GroupCounts = { selectable: number; included: number; total: number };

// What one kind grants right now; an activity without a choice counts as no access.
export function groupCounts(group: AccessGroup, choices: AccessChoices): GroupCounts {
  const counts = { selectable: 0, included: 0, total: group.activities.length };
  for (const activity of group.activities) {
    const choice = choices[activity.id] ?? 'none';
    if (choice !== 'none') counts[choice]++;
  }
  return counts;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "2 elegibles · 0 incluidas · 3 actividades", shown under each kind heading.
export const groupSummary = ({ selectable, included, total }: GroupCounts) =>
  [
    plural(selectable, 'elegible', 'elegibles'),
    plural(included, 'incluida', 'incluidas'),
    plural(total, 'actividad', 'actividades'),
  ].join(' · ');

// "Marcar todas como elegibles": every activity of the kind becomes eligible, including the
// included ones; other kinds keep their choices.
export const markAllSelectable = (group: AccessGroup, choices: AccessChoices): AccessChoices => ({
  ...choices,
  ...Object.fromEntries(group.activities.map((activity) => [activity.id, 'selectable'])),
});
