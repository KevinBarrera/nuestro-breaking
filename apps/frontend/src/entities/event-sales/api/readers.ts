import { salesClosedReasons, type EventSales } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isInstantOrNull = (value: unknown) =>
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

// An open state never carries a reason; a closed one always carries a known reason.
export function isEventSales(value: unknown): value is EventSales {
  if (!isRecord(value)) return false;
  const stateMatches =
    (value.state === 'open' && value.reason === null) ||
    (value.state === 'closed' && salesClosedReasons.some((reason) => reason === value.reason));
  return (
    typeof value.slug === 'string' &&
    value.slug.length > 0 &&
    typeof value.salesEnabled === 'boolean' &&
    isInstantOrNull(value.salesOpensAt) &&
    isInstantOrNull(value.salesClosesAt) &&
    stateMatches
  );
}
