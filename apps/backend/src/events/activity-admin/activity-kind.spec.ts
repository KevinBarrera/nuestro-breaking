import { ACTIVITY_KINDS, isActivityKind } from './activity-kind';

describe('isActivityKind', () => {
  it('accepts every stored code', () => {
    expect(ACTIVITY_KINDS).toEqual(['competition', 'workshop', 'social']);
    for (const kind of ACTIVITY_KINDS) expect(isActivityKind(kind)).toBe(true);
  });

  it('rejects unknown kinds, Spanish labels and untrimmed or differently cased codes', () => {
    for (const value of [
      'party',
      'battle',
      'Taller',
      'taller',
      ' workshop ',
      'Workshop',
      '',
      7,
      null,
    ])
      expect(isActivityKind(value)).toBe(false);
  });
});
