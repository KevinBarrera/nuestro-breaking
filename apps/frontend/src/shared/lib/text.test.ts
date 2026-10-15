import { describe, expect, it } from 'vitest';
import { hasControlCharacters } from './text';

describe('hasControlCharacters', () => {
  it('finds C0 control characters and DEL', () => {
    expect(hasControlCharacters('motivo\n')).toBe(true);
    expect(hasControlCharacters('a\tb')).toBe(true);
    expect(hasControlCharacters('\u0000')).toBe(true);
    expect(hasControlCharacters('borrar\u007f')).toBe(true);
  });

  it('accepts printable text, accents and emoji', () => {
    expect(hasControlCharacters('')).toBe(false);
    expect(hasControlCharacters('Cambió de equipo ñ ~ !')).toBe(false);
    expect(hasControlCharacters('Contraseña💃2026!')).toBe(false);
  });
});
