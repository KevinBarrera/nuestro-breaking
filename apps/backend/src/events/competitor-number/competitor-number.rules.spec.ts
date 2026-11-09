import { mayHoldCompetitorNumber, nextCompetitorNumber } from './competitor-number.rules';

describe('competitor number rules', () => {
  const competitor = { status: 'confirmed', kind: 'competition', accessible: true };

  it('lets a confirmed registration hold the number of a competition it may access', () => {
    expect(mayHoldCompetitorNumber(competitor)).toBe(true);
  });

  it('needs a competition, not a workshop, a social activity or an unknown one', () => {
    for (const kind of ['workshop', 'social', null])
      expect(mayHoldCompetitorNumber({ ...competitor, kind })).toBe(false);
  });

  it('needs access to that competition', () => {
    expect(mayHoldCompetitorNumber({ ...competitor, accessible: false })).toBe(false);
  });

  it('needs a confirmed registration', () => {
    for (const status of ['pending_payment', 'voided'])
      expect(mayHoldCompetitorNumber({ ...competitor, status })).toBe(false);
  });

  it('starts at 1 and always gives the highest number plus one, so gaps stay', () => {
    expect(nextCompetitorNumber(null)).toBe(1);
    expect(nextCompetitorNumber(1)).toBe(2);
    expect(nextCompetitorNumber(4)).toBe(5);
  });
});
