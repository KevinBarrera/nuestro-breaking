import { describe, expect, it } from 'vitest';
import { formatCompetitorNumber, matchesCompetitorNumber } from './competitor-number';

describe('formatCompetitorNumber', () => {
  it('pads numbers below 1000 to three digits and shows larger ones as they are', () => {
    expect(formatCompetitorNumber(1)).toBe('001');
    expect(formatCompetitorNumber(7)).toBe('007');
    expect(formatCompetitorNumber(42)).toBe('042');
    expect(formatCompetitorNumber(999)).toBe('999');
    expect(formatCompetitorNumber(1234)).toBe('1234');
  });
});

describe('matchesCompetitorNumber', () => {
  it('matches a digits-only query by numeric equality, with or without leading zeros', () => {
    expect(matchesCompetitorNumber(7, '7')).toBe(true);
    expect(matchesCompetitorNumber(7, '007')).toBe(true);
    expect(matchesCompetitorNumber(7, ' 07 ')).toBe(true);
    expect(matchesCompetitorNumber(17, '7')).toBe(false);
    expect(matchesCompetitorNumber(70, '7')).toBe(false);
    expect(matchesCompetitorNumber(70, '007')).toBe(false);
  });

  it('never matches without a number or with a query that is not only digits', () => {
    expect(matchesCompetitorNumber(null, '7')).toBe(false);
    expect(matchesCompetitorNumber(7, '')).toBe(false);
    expect(matchesCompetitorNumber(7, 'n7')).toBe(false);
    expect(matchesCompetitorNumber(7, '0-07')).toBe(false);
  });
});
