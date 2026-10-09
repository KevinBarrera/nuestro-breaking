import { emptyDraft, serializeDraft } from '@/features/public-purchase';
import { describe, expect, it } from 'vitest';
import {
  clearStoredDraft,
  readStoredDraft,
  readStoredReserved,
  storeDraft,
  storeReserved,
} from './draft-storage';

const draft = {
  ...emptyDraft,
  selection: { passTypeIds: ['breaking'], selectedActivityIds: {} },
};

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const reserved = {
  passes: [{ name: 'Breaking', priceCents: 200000 }],
  totalCents: 200000,
  email: 'a@b.mx',
};

describe('draft storage', () => {
  it('stores the draft per event slug and reads it back', () => {
    const storage = memoryStorage();
    storeDraft(storage, 'nov', draft);
    expect(storage.items.get('nb-purchase-draft:nov')).toBe(serializeDraft(draft));
    expect(readStoredDraft(storage, 'nov')).toEqual(draft);
    expect(readStoredDraft(storage, 'other')).toEqual(emptyDraft);
  });

  it('falls back to an empty draft when storage is missing or throws', () => {
    expect(readStoredDraft(undefined, 'nov')).toEqual(emptyDraft);
    expect(readStoredDraft(throwing, 'nov')).toEqual(emptyDraft);
    expect(() => storeDraft(throwing, 'nov', draft)).not.toThrow();
  });

  it('clears the draft and keeps the reserved copy per slug', () => {
    const storage = memoryStorage();
    storeDraft(storage, 'nov', draft);
    clearStoredDraft(storage, 'nov');
    expect(storage.items.has('nb-purchase-draft:nov')).toBe(false);
    storeReserved(storage, 'nov', reserved);
    expect(readStoredReserved(storage, 'nov')).toEqual(reserved);
    expect(readStoredReserved(storage, 'other')).toBeNull();
  });

  it('survives storage that is missing or throws for the reserved copy', () => {
    expect(readStoredReserved(undefined, 'nov')).toBeNull();
    expect(readStoredReserved(throwing, 'nov')).toBeNull();
    expect(() => storeReserved(throwing, 'nov', reserved)).not.toThrow();
    expect(() => clearStoredDraft(throwing, 'nov')).not.toThrow();
  });
});
