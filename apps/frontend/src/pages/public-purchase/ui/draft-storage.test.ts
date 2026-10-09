import { emptyDraft, serializeDraft } from '@/features/public-purchase';
import { describe, expect, it } from 'vitest';
import { readStoredDraft, storeDraft } from './draft-storage';

const draft = {
  ...emptyDraft,
  selection: { passTypeIds: ['breaking'], selectedActivityIds: {} },
};

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
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
});
