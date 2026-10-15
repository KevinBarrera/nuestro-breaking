/**
 * Whether a pass is on sale online at `now` by its own close time (#240). The close time is
 * exclusive, like the event window's: at that instant the pass is already closed. A pass without
 * one follows the event's sales window only. Manual and cash registrations never call this.
 */
export function passOnSale(onlineSalesClosesAt: Date | null, now: Date): boolean {
  return !onlineSalesClosesAt || now.getTime() < onlineSalesClosesAt.getTime();
}
