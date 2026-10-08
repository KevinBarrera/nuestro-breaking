import { salesState } from '@/events/sales';
import type {
  CatalogEventRow,
  CatalogLinkRow,
  CatalogPassRow,
  PublicActivity,
  PublicEventCatalog,
  PublicPassClass,
} from './public-catalog.types';

// Buyers see the main passes first, then the general entry, then add-ons such as Open Styles.
const classOrder: Record<string, number> = { full: 0, general: 1, add_on: 2 };
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function byPassOrder(left: CatalogPassRow, right: CatalogPassRow): number {
  return (
    (classOrder[left.passClass] ?? 3) - (classOrder[right.passClass] ?? 3) ||
    compare(left.name, right.name) ||
    compare(left.id, right.id)
  );
}

function byActivityOrder(left: PublicActivity, right: PublicActivity): number {
  return (
    compare(left.startsAt, right.startsAt) ||
    compare(left.name, right.name) ||
    compare(left.id, right.id)
  );
}

function toActivity({ activity }: CatalogLinkRow): PublicActivity {
  return {
    id: activity.id,
    name: activity.name,
    kind: activity.kind,
    startsAt: activity.startsAt.toISOString(),
    endsAt: activity.endsAt.toISOString(),
  };
}

/**
 * Build the public catalog from active rows only (the caller filters archived pass types and
 * activities). With sales closed it lists no passes (D4). It copies an explicit allowlist of
 * fields, so versions, statuses, organization ids and audit data never leak (D5). Pure.
 */
export function toPublicCatalog(
  event: CatalogEventRow,
  passes: CatalogPassRow[],
  links: CatalogLinkRow[],
  now: Date,
): PublicEventCatalog {
  const state = salesState(event, now);
  const catalog: PublicEventCatalog = {
    event: {
      slug: event.slug,
      name: event.name,
      timeZone: event.timeZone,
      startsAt: event.startsAt?.toISOString() ?? null,
      endsAt: event.endsAt?.toISOString() ?? null,
    },
    sales: {
      ...state,
      opensAt: event.salesOpensAt?.toISOString() ?? null,
      closesAt: event.salesClosesAt?.toISOString() ?? null,
    },
    passes: [],
  };
  if (state.state === 'closed') return catalog;

  catalog.passes = [...passes].sort(byPassOrder).map((pass) => {
    const access = links.filter((link) => link.passTypeId === pass.id);
    const activities = (kind: string) =>
      access
        .filter((link) => link.access === kind)
        .map(toActivity)
        .sort(byActivityOrder);
    return {
      id: pass.id,
      name: pass.name,
      passClass: pass.passClass as PublicPassClass,
      priceCents: pass.priceCents,
      requiresPassClass: pass.requiresPassClass as PublicPassClass | null,
      selectableActivities: activities('selectable'),
      includedActivities: activities('included'),
    };
  });
  return catalog;
}
