import type {
  CatalogActivity,
  CatalogPassType,
  EventWindow,
  NewPassTypeInput,
  PassTypeActivity,
  PassTypeInput,
} from '@/entities/event-catalog';
import type { EventSales } from '@/entities/event-sales';
import { routes } from '@/shared/config';
import type { ReactNode } from 'react';
import { useOutletContext } from 'react-router';

// What the passes layout (`AdminEventPassesPage`) hands its list, create and detail screens.
// The layout owns the catalog read, the writes and the notices, so they survive moving
// between the screens (for example, the archive notice shown on the list).
export type PassesContext = {
  eventId: string;
  // The event's IANA time zone, for the pass's online close time (#240).
  timeZone: string;
  // The event dates (null for an unbounded event), for the close-date shortcuts and warning.
  eventWindow: EventWindow | null;
  // Vendidos per pass from the attendee-lists snapshot; null when it could not be read.
  sold: Map<string, number> | null;
  // The event's online sale; null when it could not be read.
  sales: EventSales | null;
  passTypes: CatalogPassType[];
  activities: CatalogActivity[];
  // The last server read; its versions key the pass form (see `PassDetailScreen`).
  loadedPassTypes: CatalogPassType[];
  busy: boolean;
  // Write and refresh notices, placed by each screen under its header.
  notices: ReactNode;
  // The pass whose access save hit a version conflict, if any.
  accessConflictFor: string | null;
  // Bumped by the conflict reload (discarding local edits) and by a confirmed access save,
  // so the access editor restarts from the saved links.
  accessReset: number;
  // Each write resolves to whether it succeeded, so the screen can close its dialog.
  create: (input: NewPassTypeInput) => Promise<boolean>;
  update: (passType: CatalogPassType, input: PassTypeInput) => Promise<boolean>;
  archive: (passType: CatalogPassType) => Promise<boolean>;
  restore: (passType: CatalogPassType) => Promise<boolean>;
  saveAccess: (passType: CatalogPassType, activities: PassTypeActivity[]) => Promise<boolean>;
  reloadAccess: () => void;
};

export const usePassesContext = () => useOutletContext<PassesContext>();

const fill = (pattern: string, params: Record<string, string>) =>
  pattern.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));

export const passListPath = (eventId: string) => fill(routes.adminEventPasses, { eventId });
export const passNewPath = (eventId: string) => fill(routes.adminEventPassNew, { eventId });
export const activitiesPath = (eventId: string) => fill(routes.adminEventActivities, { eventId });
export const passDetailPath = (eventId: string, passTypeId: string) =>
  fill(routes.adminEventPass, { eventId, passTypeId });
