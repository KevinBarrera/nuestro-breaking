import type { SalesSettings, SalesState } from '@/events/sales';
import type { ServiceCharge } from '@/events/shared/service-charge';

/** An activity a buyer can pick (selectable) or gets with a pass (included). */
export type PublicActivity = {
  id: string;
  name: string;
  kind: string;
  startsAt: string;
  endsAt: string;
};

export type PublicPassClass = 'full' | 'general' | 'add_on';

export type PublicPassType = {
  id: string;
  name: string;
  passClass: PublicPassClass;
  priceCents: number;
  requiresPassClass: PublicPassClass | null;
  /** When online sales of this pass close (#240), or null to follow the event's window. */
  onlineSalesClosesAt: string | null;
  /** False once that time is reached; the pass stays listed so buyers see it is closed. */
  onSale: boolean;
  selectableActivities: PublicActivity[];
  includedActivities: PublicActivity[];
};

/** Public, read-only catalog of one event (docs/contracts/public-event-catalog.md). */
export type PublicEventCatalog = {
  event: {
    slug: string;
    name: string;
    timeZone: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  sales: SalesState & { opensAt: string | null; closesAt: string | null };
  passes: PublicPassType[];
};

/**
 * The catalog response: the catalog plus the online service charge rates (#239), so the review
 * screen shows the same charge the checkout will add.
 */
export type PublicEventCatalogResponse = PublicEventCatalog & { serviceCharge: ServiceCharge };

/** Database rows the projection reads; only active pass types and activities are loaded. */
export type CatalogEventRow = {
  id: string;
  slug: string;
  name: string;
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
} & SalesSettings;

export type CatalogPassRow = {
  id: string;
  name: string;
  passClass: string;
  priceCents: number;
  requiresPassClass: string | null;
  onlineSalesClosesAt: Date | null;
};

export type CatalogLinkRow = {
  passTypeId: string;
  access: string;
  activity: { id: string; name: string; kind: string; startsAt: Date; endsAt: Date };
};
