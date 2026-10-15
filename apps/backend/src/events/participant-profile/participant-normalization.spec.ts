import {
  buildFullName,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
  phoneMatchKey,
} from './participant-normalization';

describe('participant normalization', () => {
  it('normalizes an email by trimming and lowercasing it', () => {
    expect(normalizeEmail('  Dancer@Example.COM ')).toBe('dancer@example.com');
    expect(normalizeEmail('dancer@example.com')).toBe('dancer@example.com');
  });

  it('reduces a phone to its digits for comparison, keeping a given country code', () => {
    expect(normalizePhone(' (55) 1234-5678 ')).toBe('5512345678');
    expect(normalizePhone('+52 55 1234 5678')).toBe('525512345678');
    expect(normalizePhone('55.1234.5678')).toBe('5512345678');
    expect(normalizePhone('+52 55 1234 5678')).not.toBe(normalizePhone('55 1234 5678'));
    expect(normalizePhone('no digits')).toBe('');
  });

  it('normalizes an Instagram handle by trimming, dropping leading @ and lowercasing', () => {
    expect(normalizeInstagram('  @B.Boy_One ')).toBe('b.boy_one');
    expect(normalizeInstagram('@@crew')).toBe('crew');
    expect(normalizeInstagram('crew@home')).toBe('crew@home');
    expect(normalizeInstagram(' @ ')).toBe('');
  });

  it('builds the full name from trimmed parts, skipping a missing second last name', () => {
    expect(buildFullName(' Ana ', ' López ', ' García ')).toBe('Ana López García');
    expect(buildFullName('Ana', 'López')).toBe('Ana López');
    expect(buildFullName('Ana', 'López', null)).toBe('Ana López');
    expect(buildFullName('Ana', 'López', '   ')).toBe('Ana López');
    expect(buildFullName('Ana  María', 'de la  Cruz')).toBe('Ana María de la Cruz');
  });

  it('gives a Mexican number the same match key with or without the country code', () => {
    expect(phoneMatchKey('55 1234 5678')).toBe('5512345678');
    expect(phoneMatchKey('+52 55 1234 5678')).toBe('5512345678');
    expect(phoneMatchKey('52 (55) 1234-5678')).toBe('5512345678');
    // Legacy mobile prefix `521` before the ten-digit national number.
    expect(phoneMatchKey('+521 55 1234 5678')).toBe('5512345678');
    expect(phoneMatchKey('5215512345678')).toBe('5512345678');
  });

  it('keeps other numbers as their digits', () => {
    // Ten digits that start with 52 are a national number, not a country code.
    expect(phoneMatchKey('52 1234 5678')).toBe('5212345678');
    expect(phoneMatchKey('+1 415 555 0100')).toBe('14155550100');
    expect(phoneMatchKey('+34 612 345 678')).toBe('34612345678');
    expect(phoneMatchKey('')).toBe('');
  });
});
