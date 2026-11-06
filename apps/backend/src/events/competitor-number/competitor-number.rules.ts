import type { ActivityKind } from '@/events/activity-admin/activity-kind';

/**
 * A registration is a competitor (#377) when it is confirmed and one of the activities it may
 * access is a competition. `accessibleKinds` are the kinds of the activities the access rule
 * (`RegistrationEntitlementsService.accessibleActivityIds`) grants, so an unselected selectable
 * competition never counts.
 */
export function isCompetitor(status: string, accessibleKinds: readonly string[]): boolean {
  return status === 'confirmed' && accessibleKinds.includes('competition' satisfies ActivityKind);
}

/** Always the event's highest number plus one, starting at 1: a number is never reused. */
export function nextCompetitorNumber(currentMax: number | null): number {
  return (currentMax ?? 0) + 1;
}
