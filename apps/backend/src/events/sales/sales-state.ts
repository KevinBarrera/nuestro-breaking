export type SalesSettings = {
  salesEnabled: boolean;
  salesOpensAt: Date | null;
  salesClosesAt: Date | null;
};

export type SalesClosedReason = 'disabled' | 'not_yet_open' | 'ended';
export type SalesState =
  { state: 'open'; reason: null } | { state: 'closed'; reason: SalesClosedReason };

/**
 * Sales are open only while the admin switch is on and `now` falls inside the optional window.
 * The opening date is inclusive and the closing date exclusive. The switch wins over the dates,
 * so a disabled event always reports `disabled`. Pure: no clock, database, or framework access.
 */
export function salesState(settings: SalesSettings, now: Date): SalesState {
  if (!settings.salesEnabled) return { state: 'closed', reason: 'disabled' };
  const time = now.getTime();
  if (settings.salesOpensAt && time < settings.salesOpensAt.getTime())
    return { state: 'closed', reason: 'not_yet_open' };
  if (settings.salesClosesAt && time >= settings.salesClosesAt.getTime())
    return { state: 'closed', reason: 'ended' };
  return { state: 'open', reason: null };
}
