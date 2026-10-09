import {
  draftStorageKey,
  emptyDraft,
  parseDraft,
  parseReserved,
  reservedStorageKey,
  serializeDraft,
  serializeReserved,
  type PurchaseDraft,
  type ReservedPurchase,
} from '@/features/public-purchase';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// `sessionStorage` can be missing or throw (private mode, blocked site data). The purchase still
// works for this page view; it just will not survive a refresh.
export function readStoredDraft(storage: DraftStorage | undefined, slug: string): PurchaseDraft {
  try {
    return parseDraft(storage?.getItem(draftStorageKey(slug)) ?? null);
  } catch {
    return emptyDraft;
  }
}

export function storeDraft(storage: DraftStorage | undefined, slug: string, draft: PurchaseDraft) {
  try {
    storage?.setItem(draftStorageKey(slug), serializeDraft(draft));
  } catch {
    // Not persisted; the in-memory purchase keeps working.
  }
}

// After a reservation the purchase starts over: the next visit to pases finds no draft.
export function clearStoredDraft(storage: DraftStorage | undefined, slug: string) {
  try {
    storage?.removeItem(draftStorageKey(slug));
  } catch {
    // Nothing more to do; the reserved screen still shows.
  }
}

// The reserved screen's copy, so a refresh keeps it (D1, until #177).
export function readStoredReserved(
  storage: DraftStorage | undefined,
  slug: string,
): ReservedPurchase | null {
  try {
    return parseReserved(storage?.getItem(reservedStorageKey(slug)) ?? null);
  } catch {
    return null;
  }
}

export function storeReserved(
  storage: DraftStorage | undefined,
  slug: string,
  reserved: ReservedPurchase,
) {
  try {
    storage?.setItem(reservedStorageKey(slug), serializeReserved(reserved));
  } catch {
    // Router state still carries it for this page view.
  }
}

// Reading the global itself can throw when site data is blocked.
export function sessionDraftStorage(): DraftStorage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
