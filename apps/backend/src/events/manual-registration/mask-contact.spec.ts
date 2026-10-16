import { maskEmail, maskPhone } from './mask-contact';

describe('maskEmail', () => {
  it('keeps the first character of the local part and the whole domain', () => {
    expect(maskEmail('alex@example.com')).toBe('a***@example.com');
    expect(maskEmail('ana.lopez@gmail.com')).toBe('a***@gmail.com');
  });

  it('keeps null as null', () => {
    expect(maskEmail(null)).toBeNull();
  });

  it('hides a value without a usable local part or domain completely', () => {
    expect(maskEmail('@example.com')).toBe('***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('maskPhone', () => {
  it('shows only the last four digits and masks every other digit', () => {
    expect(maskPhone('5512344567')).toBe('******4567');
    expect(maskPhone('+52 55 1234 4567')).toBe('********4567');
  });

  it('keeps null as null', () => {
    expect(maskPhone(null)).toBeNull();
  });

  it('masks a phone of four digits or fewer completely', () => {
    expect(maskPhone('4567')).toBe('****');
    expect(maskPhone('')).toBe('');
  });
});
