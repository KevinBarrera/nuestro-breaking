import { emptyDraft, serializeDraft } from '@/features/public-purchase';
import { describe, expect, it } from 'vitest';
import { clearStoredDraft, readStoredDraft, storeDraft } from './draft-storage';

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

  it('clears the draft of one slug and survives storage that throws', () => {
    const storage = memoryStorage();
    storeDraft(storage, 'nov', draft);
    storeDraft(storage, 'other', draft);
    clearStoredDraft(storage, 'nov');
    expect(storage.items.has('nb-purchase-draft:nov')).toBe(false);
    expect(storage.items.has('nb-purchase-draft:other')).toBe(true);
    expect(() => clearStoredDraft(throwing, 'nov')).not.toThrow();
  });
});
