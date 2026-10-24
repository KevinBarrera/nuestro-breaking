import type { AttendeeLists } from '@/entities/attendee-list';
import {
  formatMxn,
  passClasses,
  type CatalogActivity,
  type CatalogPassType,
  type CatalogStatus,
  type PassClass,
} from '@/entities/event-catalog';
import type { EventSales } from '@/entities/event-sales';

// Pure derivations for the pass list (#372).

// Ids that link the tabs to the panel the screen renders.
export const passPanelId = (id: string) => `${id}-panel`;
export const passTabId = (id: string, tab: CatalogStatus) => `${id}-${tab}`;

export type PassGroup = {
  passClass: PassClass;
  label: string;
  help: string;
  passes: CatalogPassType[];
};

const groupCopy: Record<PassClass, { label: string; help: string }> = {
  full: {
    label: 'Pases completos',
    help: 'Dan acceso a actividades. Es el pase de quien compite.',
  },
  general: { label: 'Entrada general', help: 'Solo la entrada al evento.' },
  add_on: { label: 'Adicionales', help: 'Se compran junto con un pase completo.' },
};

export function passTabCounts(passTypes: CatalogPassType[]): Record<CatalogStatus, number> {
  return {
    active: passTypes.filter((passType) => passType.status === 'active').length,
    archived: passTypes.filter((passType) => passType.status === 'archived').length,
  };
}

// The tab's passes by class (full, general, add-ons, as buyers see them), each in catalog order;
// a class with no pass in the tab is left out.
export function passGroups(passTypes: CatalogPassType[], tab: CatalogStatus): PassGroup[] {
  return passClasses
    .map((passClass) => ({
      passClass,
      ...groupCopy[passClass],
      passes: passTypes.filter(
        (passType) => passType.status === tab && passType.passClass === passClass,
      ),
    }))
    .filter((group) => group.passes.length > 0);
}

export const passPriceLabel = (cents: number) => (cents === 0 ? 'Sin costo' : formatMxn(cents));

// The pass's links to active activities: the backend never sells access to archived ones.
const activeLinks = (passType: CatalogPassType, activityById: Map<string, CatalogActivity>) =>
  passType.activities.filter((link) => activityById.get(link.activityId)?.status === 'active');

const requiredLabels = { full: 'Requiere pase completo', general: 'Requiere entrada general' };

// "Incluye 1 actividad · Elige entre 2 · Requiere pase completo"; a general pass without
// activities is the event entry.
export function passAccessSummary(
  passType: CatalogPassType,
  activityById: Map<string, CatalogActivity>,
): string {
  const links = activeLinks(passType, activityById);
  const included = links.filter((link) => link.access === 'included').length;
  const selectable = links.filter((link) => link.access === 'selectable').length;
  if (passType.passClass === 'general' && links.length === 0) return 'Entrada al evento';
  const parts: string[] = [];
  if (included > 0)
    parts.push(`Incluye ${included} ${included === 1 ? 'actividad' : 'actividades'}`);
  if (selectable > 0) parts.push(`Elige entre ${selectable}`);
  if (parts.length === 0) parts.push('Sin actividades');
  if (passType.requiresPassClass) parts.push(requiredLabels[passType.requiresPassClass]);
  return parts.join(' · ');
}

// A full or add-on pass that gives access to no active activity: whoever buys it cannot enter
// any competition. A general pass is the event entry, so it never counts.
export const noAccess = (passType: CatalogPassType, activityById: Map<string, CatalogActivity>) =>
  passType.passClass !== 'general' && activeLinks(passType, activityById).length === 0;

export const noAccessPill = 'No da acceso a ninguna actividad';

// The Activos notice for the passes `noAccess` flags.
export function misconfiguredNotice(
  passes: CatalogPassType[],
): { title: string; text: string } | null {
  const [first] = passes;
  if (!first) return null;
  return {
    title:
      passes.length === 1
        ? `${first.name} no da acceso a ninguna actividad.`
        : `${passes.length} pases no dan acceso a ninguna actividad.`,
    text: 'Quien lo compre no podrá inscribirse a competencias. Ábrelo y elige sus actividades, o cámbialo a Entrada general.',
  };
}

// Vendidos per pass from the attendee-lists snapshot: the confirmed registrations holding it.
// A pass nobody holds is missing from the map (read it as 0).
export function soldCounts(lists: AttendeeLists): Map<string, number> {
  const counts = new Map<string, number>();
  for (const registration of lists.registrations) {
    if (registration.status !== 'confirmed') continue;
    for (const id of registration.passTypeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export const soldLabel = (count: number) => (count === 1 ? 'vendido' : 'vendidos');

// Whether the pass sells online right now: its own close date has not passed and the event's
// online sale is open. With the event sale state unknown (`null`), only the pass date decides.
export function saleOpen(passType: CatalogPassType, sales: EventSales | null, now: number) {
  if (passType.onlineSalesClosesAt && Date.parse(passType.onlineSalesClosesAt) <= now) return false;
  return sales?.state !== 'closed';
}

export const saleLabel = (open: boolean) => (open ? 'En venta' : 'Venta cerrada');
