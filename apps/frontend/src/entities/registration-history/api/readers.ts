import {
  historyActorKinds,
  historyFilters,
  type HistoryActor,
  type HistoryCashValues,
  type HistoryCounts,
  type HistoryDetails,
  type HistoryItem,
  type HistoryPage,
} from './types';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);
const isAmount = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value));
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);

function readCash(value: unknown): HistoryCashValues | null {
  if (!isRecord(value) || !isAmount(value.amountCents) || !isTextOrNull(value.receipt)) return null;
  return { amountCents: value.amountCents, receipt: value.receipt };
}

// Copies only the fields of each known kind; a known kind with a malformed field is rejected,
// and an unknown kind reads as `other` without its values.
function readDetails(value: unknown): HistoryDetails | null {
  if (!isRecord(value) || !isText(value.kind)) return null;
  const details = value;
  switch (details.kind) {
    case 'manual_registration':
    case 'online_registration':
    case 'complimentary_confirmation':
    case 'other':
      return { kind: details.kind };
    case 'pass_assignment':
    case 'pass_removal':
      return isTextOrNull(details.passTypeName)
        ? { kind: details.kind, passTypeName: details.passTypeName }
        : null;
    case 'pass_selection_change':
      return isTextOrNull(details.passTypeName) &&
        isTexts(details.fromActivityNames) &&
        isTexts(details.toActivityNames)
        ? {
            kind: details.kind,
            passTypeName: details.passTypeName,
            fromActivityNames: details.fromActivityNames,
            toActivityNames: details.toActivityNames,
          }
        : null;
    case 'cash_confirmation':
      return isAmount(details.amountCents) && isTextOrNull(details.receipt)
        ? { kind: details.kind, amountCents: details.amountCents, receipt: details.receipt }
        : null;
    case 'cash_correction': {
      const previous = readCash(details.previous);
      const current = readCash(details.current);
      return previous && current ? { kind: details.kind, previous, current } : null;
    }
    case 'payment_approval':
      return isAmount(details.amountCents) && typeof details.lateApproval === 'boolean'
        ? {
            kind: details.kind,
            amountCents: details.amountCents,
            lateApproval: details.lateApproval,
          }
        : null;
    case 'registration_void':
    case 'registration_expiry':
      return isTextOrNull(details.fromStatus) && isTextOrNull(details.toStatus)
        ? { kind: details.kind, fromStatus: details.fromStatus, toStatus: details.toStatus }
        : null;
    case 'registration_correction':
      return isTexts(details.changedFields)
        ? { kind: details.kind, changedFields: details.changedFields }
        : null;
    case 'registration_discipline_swap':
      return isTextOrNull(details.fromPassTypeName) &&
        isTextOrNull(details.toPassTypeName) &&
        isTexts(details.fromActivityNames) &&
        isTexts(details.toActivityNames)
        ? {
            kind: details.kind,
            fromPassTypeName: details.fromPassTypeName,
            toPassTypeName: details.toPassTypeName,
            fromActivityNames: details.fromActivityNames,
            toActivityNames: details.toActivityNames,
          }
        : null;
    default:
      return { kind: 'other' };
  }
}

function readActor(value: unknown): HistoryActor | null {
  if (!isRecord(value) || !isTextOrNull(value.name)) return null;
  const kind = historyActorKinds.find((candidate) => candidate === value.kind);
  return kind ? { kind, name: value.name } : null;
}

function readItem(value: unknown): HistoryItem | null {
  if (!isRecord(value) || !isRecord(value.registration)) return null;
  const { registration } = value;
  const actor = readActor(value.actor);
  const details = readDetails(value.details);
  if (
    !actor ||
    !details ||
    !isText(value.id) ||
    !isText(value.occurredAt) ||
    Number.isNaN(Date.parse(value.occurredAt)) ||
    !isText(value.operationType) ||
    !isTextOrNull(value.reason) ||
    !isText(registration.id) ||
    !isTextOrNull(registration.folio) ||
    !isText(registration.participantName)
  )
    return null;
  return {
    id: value.id,
    occurredAt: value.occurredAt,
    operationType: value.operationType,
    actor,
    registration: {
      id: registration.id,
      folio: registration.folio,
      participantName: registration.participantName,
    },
    reason: value.reason,
    details,
  };
}

function readCounts(value: unknown): HistoryCounts | null {
  if (!isRecord(value)) return null;
  const counts = {} as HistoryCounts;
  for (const filter of historyFilters) {
    const count = value[filter];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
    counts[filter] = count;
  }
  return counts;
}

export function readHistoryPage(value: unknown): HistoryPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isTextOrNull(value.nextCursor))
    return null;
  const counts = readCounts(value.counts);
  if (!counts) return null;
  const items: HistoryItem[] = [];
  for (const entry of value.items) {
    const item = readItem(entry);
    if (!item) return null;
    items.push(item);
  }
  return { items, nextCursor: value.nextCursor, counts };
}
