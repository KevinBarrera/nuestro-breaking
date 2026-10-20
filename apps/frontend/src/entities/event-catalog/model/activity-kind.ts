// The activity kinds the API accepts (#249), in the order the admin form offers them.
export const activityKinds = ['battle', 'competition', 'workshop', 'social'] as const;

export type ActivityKind = (typeof activityKinds)[number];

export function isActivityKind(value: string): value is ActivityKind {
  return activityKinds.some((kind) => kind === value);
}
