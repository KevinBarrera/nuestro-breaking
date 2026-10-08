import type { SalesSettings, SalesState } from './sales-state';

/** Admin view of an event's public address and sales settings, with the state computed now. */
export type AdminEventSales = {
  slug: string;
  salesEnabled: boolean;
  salesOpensAt: string | null;
  salesClosesAt: string | null;
} & SalesState;

export type EventSalesChanges = SalesSettings;
