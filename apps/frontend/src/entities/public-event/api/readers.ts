import {
  publicPassClasses,
  publicSalesClosedReasons,
  registrationRuleCodes,
  type PublicActivity,
  type PublicCatalog,
  type PublicEventFailure,
  type PublicPass,
  type Registration,
  type RegistrationPass,
} from './types';

// Manual response validation: a malformed payload is treated as a failed request, never shown.
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((known) => known === value);
}

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const instant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const instantOrNull = (value: unknown) => value === null || instant(value);
const cents = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const listOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

function isPublicActivity(value: unknown): value is PublicActivity {
  const row = record(value);
  return (
    !!row &&
    text(row.id) &&
    text(row.name) &&
    text(row.kind) &&
    instant(row.startsAt) &&
    instant(row.endsAt)
  );
}

function isPublicPass(value: unknown): value is PublicPass {
  const row = record(value);
  return (
    !!row &&
    text(row.id) &&
    text(row.name) &&
    oneOf(publicPassClasses, row.passClass) &&
    cents(row.priceCents) &&
    (row.requiresPassClass === null || oneOf(publicPassClasses, row.requiresPassClass)) &&
    listOf(row.selectableActivities, isPublicActivity) &&
    listOf(row.includedActivities, isPublicActivity)
  );
}

export function isPublicCatalog(value: unknown): value is PublicCatalog {
  const body = record(value);
  const event = record(body?.event);
  const sales = record(body?.sales);
  if (!body || !event || !sales) return false;
  // An open state never carries a reason; a closed one always carries a known reason.
  const stateMatches =
    (sales.state === 'open' && sales.reason === null) ||
    (sales.state === 'closed' && oneOf(publicSalesClosedReasons, sales.reason));
  return (
    text(event.slug) &&
    text(event.name) &&
    text(event.timeZone) &&
    instantOrNull(event.startsAt) &&
    instantOrNull(event.endsAt) &&
    stateMatches &&
    instantOrNull(sales.opensAt) &&
    instantOrNull(sales.closesAt) &&
    listOf(body.passes, isPublicPass)
  );
}

function isRegistrationPass(value: unknown): value is RegistrationPass {
  const row = record(value);
  return (
    !!row &&
    text(row.passTypeId) &&
    text(row.name) &&
    oneOf(publicPassClasses, row.passClass) &&
    cents(row.priceCents) &&
    listOf(row.selectedActivityIds, text)
  );
}

export function isRegistration(value: unknown): value is Registration {
  const body = record(value);
  return (
    !!body &&
    text(body.registrationId) &&
    body.status === 'pending_payment' &&
    listOf(body.passes, isRegistrationPass) &&
    cents(body.totalCents)
  );
}

function stringEntries(value: unknown): Record<string, string> {
  const entries = Object.entries(record(value) ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

// Reads a non-2xx answer into a failure. Only known codes and reasons are kept, so screens never
// echo backend text. A 409 is told apart by its body: `reason` (sales closed) or `code`.
export function readFailure(status: number, body: unknown): PublicEventFailure {
  const row = record(body);
  if (status === 404) return { kind: 'not-found' };
  if (status === 429) return { kind: 'rate-limited' };
  if (status === 400) return { kind: 'invalid', fieldErrors: stringEntries(row?.fieldErrors) };
  if (status === 409) {
    if (oneOf(publicSalesClosedReasons, row?.reason))
      return { kind: 'sales-closed', reason: row.reason };
    if (row?.code === 'registration_unavailable') return { kind: 'unavailable' };
    if (oneOf(registrationRuleCodes, row?.code)) return { kind: 'rule', code: row.code };
  }
  return { kind: 'error' };
}
