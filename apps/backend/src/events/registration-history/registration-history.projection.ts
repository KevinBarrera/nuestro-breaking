import type { HistoryCursor, HistoryDetails } from './registration-history.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Microsecond UTC timestamps, as PostgreSQL stores them, so the keyset compares exactly.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// Operation types whose `note` is the administrator's reason. The optional `cash_confirmation`
// note is an operator remark captured at the till, not a reason, so it stays out of the history.
const REASON_TYPES = new Set([
  'complimentary_confirmation',
  'pass_selection_change',
  'registration_void',
  'registration_correction',
  'registration_discipline_swap',
  'cash_correction',
]);

export type AuditFact = {
  operationType: string;
  amountCents: number | null;
  receipt: string | null;
  note: string | null;
  beforeState: unknown;
  afterState: unknown;
  facts: unknown;
};

export type CatalogNames = { passTypes: Map<string, string>; activities: Map<string, string> };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function passTypeIds(fact: AuditFact): string[] {
  const facts = record(fact.facts);
  switch (fact.operationType) {
    case 'pass_assignment':
    case 'pass_removal':
    case 'pass_selection_change':
      return strings([facts.passTypeId]);
    case 'registration_discipline_swap':
      return strings([facts.fromPassTypeId, facts.toPassTypeId]);
    default:
      return [];
  }
}
function activityIds(fact: AuditFact): string[] {
  const facts = record(fact.facts);
  switch (fact.operationType) {
    case 'pass_selection_change':
      return [
        ...strings(record(fact.beforeState).selections),
        ...strings(record(fact.afterState).selections),
      ];
    case 'registration_discipline_swap':
      return [...strings(facts.fromActivityIds), ...strings(facts.toActivityIds)];
    default:
      return [];
  }
}

/** The pass type and activity ids a page of facts needs named, so they resolve in one query each. */
export function referencedIds(facts: AuditFact[]) {
  const valid = (ids: string[]) => [...new Set(ids.filter((id) => UUID.test(id)))];
  return {
    passTypeIds: valid(facts.flatMap(passTypeIds)),
    activityIds: valid(facts.flatMap(activityIds)),
  };
}

export function reasonOf(fact: AuditFact): string | null {
  return REASON_TYPES.has(fact.operationType) ? fact.note : null;
}

export function detailsOf(fact: AuditFact, names: CatalogNames): HistoryDetails {
  const before = record(fact.beforeState);
  const after = record(fact.afterState);
  const facts = record(fact.facts);
  const passName = (id: unknown) => names.passTypes.get(text(id) ?? '') ?? null;
  const activityNames = (ids: unknown) =>
    strings(ids)
      .flatMap((id) => names.activities.get(id) ?? [])
      .sort((a, b) => a.localeCompare(b));
  switch (fact.operationType) {
    case 'manual_registration':
    case 'online_registration':
    case 'complimentary_confirmation':
      return { kind: fact.operationType };
    case 'pass_assignment':
    case 'pass_removal':
      return { kind: fact.operationType, passTypeName: passName(facts.passTypeId) };
    case 'pass_selection_change':
      return {
        kind: 'pass_selection_change',
        passTypeName: passName(facts.passTypeId),
        fromActivityNames: activityNames(before.selections),
        toActivityNames: activityNames(after.selections),
      };
    case 'cash_confirmation':
      return { kind: 'cash_confirmation', amountCents: fact.amountCents, receipt: fact.receipt };
    case 'cash_correction':
      return {
        kind: 'cash_correction',
        previous: { amountCents: integer(before.amountCents), receipt: text(before.receipt) },
        current: { amountCents: integer(after.amountCents), receipt: text(after.receipt) },
      };
    case 'payment_approval':
      return {
        kind: 'payment_approval',
        amountCents: fact.amountCents,
        lateApproval: facts.lateApproval === true,
      };
    case 'registration_void':
    case 'registration_expiry':
      return {
        kind: fact.operationType,
        fromStatus: text(before.status),
        toStatus: text(after.status),
      };
    case 'registration_correction':
      return { kind: 'registration_correction', changedFields: strings(facts.changedFields) };
    case 'registration_discipline_swap':
      return {
        kind: 'registration_discipline_swap',
        fromPassTypeName: passName(facts.fromPassTypeId),
        toPassTypeName: passName(facts.toPassTypeId),
        fromActivityNames: activityNames(facts.fromActivityIds),
        toActivityNames: activityNames(facts.toActivityIds),
      };
    default:
      return { kind: 'other' };
  }
}

export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`).toString('base64url');
}

/** The `(createdAt, id)` of the last item seen, or null when the cursor is not one we issued. */
export function decodeCursor(value: string): HistoryCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const [createdAt, id, ...rest] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  if (rest.length || !id || !UUID.test(id) || !CURSOR_TIME.test(createdAt)) return null;
  // Rejects impossible dates such as month 13 before they reach the database.
  const millis = `${createdAt.slice(0, 23)}Z`;
  const parsed = new Date(millis);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== millis) return null;
  return { createdAt, id: id.toLowerCase() };
}
