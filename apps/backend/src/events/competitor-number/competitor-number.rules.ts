import type { ActivityKind } from '@/events/activity-admin/activity-kind';

/**
 * A registration may hold a number of one competition (#377) when it is confirmed and that
 * activity is an active competition it may access. `accessible` is the access rule's answer
 * (`RegistrationEntitlementsService.accessibleActivityIds`), so an unselected selectable
 * competition never counts.
 */
export function mayHoldCompetitorNumber(input: {
  status: string;
  kind: string | null;
  accessible: boolean;
}): boolean {
  return (
    input.status === 'confirmed' &&
    input.kind === ('competition' satisfies ActivityKind) &&
    input.accessible
  );
}

/** Always the competition's highest number plus one, starting at 1: a number is never reused. */
export function nextCompetitorNumber(currentMax: number | null): number {
  return (currentMax ?? 0) + 1;
}
