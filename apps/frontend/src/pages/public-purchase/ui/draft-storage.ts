import {
  draftStorageKey,
  emptyDraft,
  parseDraft,
  serializeDraft,
  type PurchaseDraft,
} from '@/features/public-purchase';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

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

// Reading the global itself can throw when site data is blocked.
export function sessionDraftStorage(): DraftStorage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
