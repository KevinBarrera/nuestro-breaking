import { describe, expect, it } from 'vitest';
import { centsToInput, formatMxn, parseMxnToCents } from './money';

describe('formatMxn', () => {
  it('formats integer cents as Mexican pesos', () => {
    expect(formatMxn(150000)).toBe('$1,500.00');
    expect(formatMxn(123456789)).toBe('$1,234,567.89');
    expect(formatMxn(5)).toBe('$0.05');
    expect(formatMxn(0)).toBe('$0.00');
  });
});

describe('parseMxnToCents', () => {
  it.each([
    ['1500', 150000],
    [' 1500.5 ', 150050],
    ['1500,50', 150050],
    ['0,05', 5],
    ['21474836,47', 2147483647],
  ])('reads %j as %i cents with a dot or comma decimal separator', (input, cents) => {
    expect(parseMxnToCents(input)).toBe(cents);
  });

  it('rejects prices above the largest storable amount', () => {
    expect(parseMxnToCents('21474836,48')).toBeNull();
  });

  // "1,500" or "1.500" could mean either 1500 or 1.5 pesos, so thousand separators never parse.
  it.each(['1,500.50', '1.500,50', '1,500', '1.500', '12.345'])(
    'rejects the ambiguous thousand-separated price %j',
    (input) => {
      expect(parseMxnToCents(input)).toBeNull();
    },
  );

  it.each(['1 500', ',50', '', '-5', '12a', '1.2.3'])('rejects the malformed price %j', (input) => {
    expect(parseMxnToCents(input)).toBeNull();
  });
});

describe('centsToInput', () => {
  it('writes cents as a two-decimal input value that parses back to the same cents', () => {
    expect(centsToInput(150050)).toBe('1500.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(0)).toBe('0.00');
    for (const cents of [0, 5, 150050, 2147483647])
      expect(parseMxnToCents(centsToInput(cents))).toBe(cents);
  });
});
