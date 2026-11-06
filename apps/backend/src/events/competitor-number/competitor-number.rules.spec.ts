import { isCompetitor, nextCompetitorNumber } from './competitor-number.rules';

describe('competitor number rules', () => {
  it('makes a confirmed registration with an accessible competition a competitor', () => {
    expect(isCompetitor('confirmed', ['workshop', 'competition'])).toBe(true);
  });

  it('needs an accessible competition, not a workshop, social or an empty access list', () => {
    expect(isCompetitor('confirmed', ['workshop', 'social'])).toBe(false);
    expect(isCompetitor('confirmed', [])).toBe(false);
  });

  it('needs a confirmed registration', () => {
    expect(isCompetitor('pending_payment', ['competition'])).toBe(false);
    expect(isCompetitor('voided', ['competition'])).toBe(false);
  });

  it('starts at 1 and always gives the highest number plus one, so gaps stay', () => {
    expect(nextCompetitorNumber(null)).toBe(1);
    expect(nextCompetitorNumber(1)).toBe(2);
    expect(nextCompetitorNumber(4)).toBe(5);
  });
});
