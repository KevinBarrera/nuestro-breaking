import { describe, expect, it } from 'vitest';
import { emptyBuyerForm } from './buyer-form';
import { draftStorageKey, emptyDraft, parseDraft, serializeDraft } from './purchase-draft';

const draft = {
  selection: { passTypeIds: ['breaking'], selectedActivityIds: { breaking: ['bboy'] } },
  buyer: { ...emptyBuyerForm, firstName: 'Ana', phone: '3312345678' },
};

describe('purchase draft', () => {
  it('round-trips a draft', () => {
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it('keys drafts per event slug', () => {
    expect(draftStorageKey('los-mas-pesados')).toBe('nb-purchase-draft:los-mas-pesados');
  });

  it('returns an empty draft for missing, junk or other-version data', () => {
    expect(parseDraft(null)).toEqual(emptyDraft);
    expect(parseDraft('{not json')).toEqual(emptyDraft);
    expect(parseDraft('[]')).toEqual(emptyDraft);
    expect(parseDraft(JSON.stringify({ version: 2, ...draft }))).toEqual(emptyDraft);
  });

  it('drops malformed parts and keeps the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      selection: { passTypeIds: ['breaking', 3], selectedActivityIds: { breaking: 'bboy' } },
      buyer: { firstName: 'Ana', email: 42, extra: 'x' },
    });
    expect(parseDraft(raw)).toEqual({
      selection: { passTypeIds: ['breaking'], selectedActivityIds: {} },
      buyer: { ...emptyBuyerForm, firstName: 'Ana' },
    });
  });
});
