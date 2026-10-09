import { buyerFields, emptyBuyerForm, type BuyerForm } from './buyer-form';
import { emptySelection, type PurchaseSelection } from './purchase-selection';

// The in-progress purchase kept in `sessionStorage` per event slug, so a refresh keeps it (D2).
// Pages own the storage access; this module only (de)serializes. Restored selections must still
// go through `normalizeSelection` against the fresh catalog.
export type PurchaseDraft = { selection: PurchaseSelection; buyer: BuyerForm };

const DRAFT_VERSION = 1;

export const emptyDraft: PurchaseDraft = { selection: emptySelection, buyer: emptyBuyerForm };

export const draftStorageKey = (slug: string) => `nb-purchase-draft:${slug}`;

export function serializeDraft(draft: PurchaseDraft): string {
  return JSON.stringify({ version: DRAFT_VERSION, ...draft });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function readSelection(value: unknown): PurchaseSelection {
  const row = record(value);
  if (!row) return emptySelection;
  const selectedActivityIds: Record<string, string[]> = {};
  for (const [passId, ids] of Object.entries(record(row.selectedActivityIds) ?? {}))
    if (Array.isArray(ids)) selectedActivityIds[passId] = strings(ids);
  return { passTypeIds: strings(row.passTypeIds), selectedActivityIds };
}

function readBuyer(value: unknown): BuyerForm {
  const row = record(value) ?? {};
  const buyer = { ...emptyBuyerForm };
  for (const field of buyerFields) {
    const text = row[field];
    if (typeof text === 'string') buyer[field] = text;
  }
  return buyer;
}

// Tolerant read: missing, unparsable or other-version data is an empty draft, and malformed parts
// fall back to empty values instead of failing the whole draft.
export function parseDraft(raw: string | null): PurchaseDraft {
  if (!raw) return emptyDraft;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyDraft;
  }
  const row = record(value);
  if (!row || row.version !== DRAFT_VERSION) return emptyDraft;
  return { selection: readSelection(row.selection), buyer: readBuyer(row.buyer) };
}
