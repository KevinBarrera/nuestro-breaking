import { parseCreateVenueInput, parseUpdateVenueInput } from './venue-input';

describe('venue input', () => {
  it('trims the name', () => {
    expect(parseCreateVenueInput({ name: '  Foro Principal ' })).toEqual({
      ok: true,
      value: { name: 'Foro Principal' },
    });
    expect(parseUpdateVenueInput({ name: 'Foro Sur' })).toEqual({
      ok: true,
      value: { name: 'Foro Sur' },
    });
  });

  it.each([['   '], [''], ['Foro\u0007'], ['Foro\n'], ['x'.repeat(121)], [7], [null]])(
    'refuses the name %p',
    (name) => {
      expect(parseCreateVenueInput({ name })).toEqual({
        ok: false,
        fieldErrors: { name: 'invalid' },
      });
      expect(parseUpdateVenueInput({ name })).toEqual({
        ok: false,
        fieldErrors: { name: 'invalid' },
      });
    },
  );

  it('accepts a name of exactly 120 characters', () => {
    expect(parseCreateVenueInput({ name: 'x'.repeat(120) })).toMatchObject({ ok: true });
  });

  it('marks unknown keys as invalid', () => {
    expect(parseCreateVenueInput({ name: 'Foro', capacity: 300 })).toEqual({
      ok: false,
      fieldErrors: { capacity: 'invalid' },
    });
  });

  it('refuses a body that is not an object, and an empty one by intent', () => {
    for (const body of [null, 'Foro', ['Foro']]) {
      expect(parseCreateVenueInput(body)).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
      expect(parseUpdateVenueInput(body)).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
    }
    expect(parseCreateVenueInput({})).toEqual({ ok: false, fieldErrors: { name: 'invalid' } });
    expect(parseUpdateVenueInput({})).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
  });
});
