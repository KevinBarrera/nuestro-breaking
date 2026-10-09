import {
  buildFullName,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
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
});
