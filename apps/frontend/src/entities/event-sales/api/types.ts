// Shapes of `GET`/`PUT /admin/events/:eventId/sales` (`docs/contracts/event-sales.md`).
export const salesStates = ['open', 'closed'] as const;
export const salesClosedReasons = ['disabled', 'not_yet_open', 'ended'] as const;

export type SalesState = (typeof salesStates)[number];
export type SalesClosedReason = (typeof salesClosedReasons)[number];

// Dates are ISO 8601 instants in UTC, or null when that side of the window is not limited.
export type EventSales = {
  slug: string;
  salesEnabled: boolean;
  salesOpensAt: string | null;
  salesClosesAt: string | null;
  state: SalesState;
  reason: SalesClosedReason | null;
};

// The PUT replaces all three settings, so every key is always sent. Dates carry an offset.
export type EventSalesInput = {
  salesEnabled: boolean;
  salesOpensAt: string | null;
  salesClosesAt: string | null;
};

export type SalesFailure = 'denied' | 'not-found' | 'invalid' | 'error';
