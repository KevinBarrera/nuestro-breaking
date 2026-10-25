import type { ActivityAccess, CatalogActivity, PassTypeActivity } from '@/entities/event-catalog';

// What a pass grants for one activity; 'none' is the absence of an access link.
export type AccessChoice = ActivityAccess | 'none';
export type AccessChoices = Record<string, AccessChoice>;
export const savedChoices = (links: PassTypeActivity[]): AccessChoices =>
  Object.fromEntries(links.map((link) => [link.activityId, link.access]));

// Saved links that a save would drop because their activity is no longer listed.
export function droppedLinks(
  links: PassTypeActivity[],
  groups: { activities: CatalogActivity[] }[],
) {
  const listed = new Set(groups.flatMap((group) => group.activities.map((entry) => entry.id)));
  return links.filter((link) => !listed.has(link.activityId)).length;
}
