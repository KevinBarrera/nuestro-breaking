import { parsePublicRegistrationRequest } from './public-registration-request';

const TODAY = '2026-10-08';
const PASS = '6f1c2b8e-0000-4000-8000-000000000001';
const ADD_ON = '6f1c2b8e-0000-4000-8000-000000000002';
const ACTIVITY = 'a93e0000-0000-4000-8000-000000000003';

const buyer = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  firstLastName: 'López',
  email: 'ana@example.com',
  phone: '55 1234 5678',
  ...overrides,
});
const body = (overrides: Record<string, unknown> = {}) => ({
  buyer: buyer(),
  passes: [{ passTypeId: PASS }],
  ...overrides,
});
const errorsOf = (input: unknown) => {
  const result = parsePublicRegistrationRequest(input, TODAY);
  if (result.ok) throw new Error('expected validation errors');
  return result.fieldErrors;
};

describe('parsePublicRegistrationRequest', () => {
  it('accepts the required fields and normalizes the buyer', () => {
    const result = parsePublicRegistrationRequest(
      body({
        buyer: buyer({
          firstName: '  Ana ',
          email: ' Ana@Example.COM ',
          phone: ' +52 55 1234 5678 ',
        }),
      }),
      TODAY,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        buyer: {
          firstName: 'Ana',
          firstLastName: 'López',
          secondLastName: null,
          stageName: null,
          email: 'ana@example.com',
          phone: '+52 55 1234 5678',
          city: null,
          instagram: null,
          level: null,
          birthDate: null,
        },
        passes: [{ passTypeId: PASS, selectedActivityIds: [] }],
      },
    });
  });

  it('accepts every optional field, treating blank optional text as absent', () => {
    const result = parsePublicRegistrationRequest(
      body({
        buyer: buyer({
          secondLastName: ' García ',
          stageName: 'B-Girl Ana',
          city: '',
          instagram: ' @B.Girl_Ana ',
          level: null,
          birthDate: '2000-02-29',
        }),
        passes: [
          { passTypeId: PASS.toUpperCase(), selectedActivityIds: [ACTIVITY] },
          { passTypeId: ADD_ON },
        ],
      }),
      TODAY,
    );

    expect(result.ok && result.value.buyer).toMatchObject({
      secondLastName: 'García',
      stageName: 'B-Girl Ana',
      city: null,
      instagram: 'b.girl_ana',
      level: null,
      birthDate: '2000-02-29',
    });
    expect(result.ok && result.value.passes).toEqual([
      { passTypeId: PASS, selectedActivityIds: [ACTIVITY] },
      { passTypeId: ADD_ON, selectedActivityIds: [] },
    ]);
  });

  it('reports every missing required field by path', () => {
    expect(errorsOf({ buyer: {}, passes: [] })).toEqual({
      'buyer.firstName': 'required',
      'buyer.firstLastName': 'required',
      'buyer.email': 'required',
      'buyer.phone': 'required',
      passes: 'required',
    });
    expect(errorsOf({})).toEqual({ buyer: 'required', passes: 'required' });
    expect(errorsOf(body({ buyer: buyer({ firstName: '  ', email: '' }) }))).toEqual({
      'buyer.firstName': 'required',
      'buyer.email': 'required',
    });
  });

  it('rejects a body or nested value of the wrong type', () => {
    expect(errorsOf(null)).toEqual({ body: 'invalid' });
    expect(errorsOf([])).toEqual({ body: 'invalid' });
    expect(errorsOf(body({ buyer: 'Ana', passes: {} }))).toEqual({
      buyer: 'invalid',
      passes: 'invalid',
    });
    expect(errorsOf(body({ buyer: buyer({ firstName: 7, city: false }) }))).toEqual({
      'buyer.firstName': 'invalid',
      'buyer.city': 'invalid',
    });
  });

  it('rejects unknown keys at every level', () => {
    expect(
      errorsOf({
        ...body({ buyer: buyer({ country: 'MX' }), passes: [{ passTypeId: PASS, qty: 2 }] }),
        legal: true,
      }),
    ).toEqual({
      legal: 'unknown_field',
      'buyer.country': 'unknown_field',
      'passes[0].qty': 'unknown_field',
    });
  });

  it('bounds text lengths like the participant checks', () => {
    expect(
      errorsOf(
        body({
          buyer: buyer({
            firstName: 'a'.repeat(101),
            firstLastName: 'b'.repeat(100),
            secondLastName: 'c'.repeat(101),
            stageName: 'd'.repeat(101),
            city: 'e'.repeat(101),
            instagram: 'f'.repeat(65),
            level: 'g'.repeat(51),
            email: `${'h'.repeat(250)}@example.com`,
            phone: '5'.repeat(31),
          }),
        }),
      ),
    ).toEqual({
      'buyer.firstName': 'too_long',
      'buyer.secondLastName': 'too_long',
      'buyer.stageName': 'too_long',
      'buyer.city': 'too_long',
      'buyer.instagram': 'too_long',
      'buyer.level': 'too_long',
      'buyer.email': 'too_long',
      'buyer.phone': 'too_long',
    });
  });

  it.each(['ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', 'a@b@c.com'])(
    'rejects the malformed email %p',
    (email) => {
      expect(errorsOf(body({ buyer: buyer({ email }) }))).toEqual({ 'buyer.email': 'invalid' });
    },
  );

  it('needs between 10 and 15 phone digits', () => {
    expect(errorsOf(body({ buyer: buyer({ phone: '55 1234 567' }) }))).toEqual({
      'buyer.phone': 'invalid',
    });
    expect(errorsOf(body({ buyer: buyer({ phone: '1234567890123456' }) }))).toEqual({
      'buyer.phone': 'invalid',
    });
    expect(
      parsePublicRegistrationRequest(body({ buyer: buyer({ phone: '(55) 1234-5678' }) }), TODAY),
    ).toMatchObject({ ok: true });
  });

  it('rejects an Instagram handle that is only @ or contains spaces', () => {
    expect(errorsOf(body({ buyer: buyer({ instagram: '@' }) }))).toEqual({
      'buyer.instagram': 'invalid',
    });
    expect(errorsOf(body({ buyer: buyer({ instagram: 'ana lopez' }) }))).toEqual({
      'buyer.instagram': 'invalid',
    });
  });

  it.each(['2000-13-01', '2001-02-29', '2000-1-01', '01/02/2000', '1899-12-31', '2000-02-30T00'])(
    'rejects the birth date %p',
    (birthDate) => {
      expect(errorsOf(body({ buyer: buyer({ birthDate }) }))).toEqual({
        'buyer.birthDate': 'invalid',
      });
    },
  );

  it('rejects a birth date in the future and accepts today', () => {
    expect(errorsOf(body({ buyer: buyer({ birthDate: '2026-10-09' }) }))).toEqual({
      'buyer.birthDate': 'in_future',
    });
    expect(
      parsePublicRegistrationRequest(body({ buyer: buyer({ birthDate: TODAY }) }), TODAY),
    ).toMatchObject({ ok: true });
  });

  it('reports malformed passes by index', () => {
    expect(
      errorsOf(
        body({
          passes: [
            'pass',
            {},
            { passTypeId: 'not-a-uuid' },
            { passTypeId: ADD_ON, selectedActivityIds: 'x' },
            { passTypeId: PASS, selectedActivityIds: [ACTIVITY, 'bad', ACTIVITY.toUpperCase()] },
          ],
        }),
      ),
    ).toEqual({
      'passes[0]': 'invalid',
      'passes[1].passTypeId': 'required',
      'passes[2].passTypeId': 'invalid',
      'passes[3].selectedActivityIds': 'invalid',
      'passes[4].selectedActivityIds[1]': 'invalid',
      'passes[4].selectedActivityIds[2]': 'duplicate',
    });
  });

  it('rejects the same pass type twice and too many passes or selections', () => {
    expect(
      errorsOf(body({ passes: [{ passTypeId: PASS }, { passTypeId: PASS.toUpperCase() }] })),
    ).toEqual({ 'passes[1].passTypeId': 'duplicate' });
    const many = Array.from({ length: 11 }, (_, index) => ({
      passTypeId: `6f1c2b8e-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(errorsOf(body({ passes: many }))).toEqual({ passes: 'too_many' });
    const activities = Array.from(
      { length: 21 },
      (_, index) => `a93e0000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(
      errorsOf(body({ passes: [{ passTypeId: PASS, selectedActivityIds: activities }] })),
    ).toEqual({ 'passes[0].selectedActivityIds': 'too_many' });
  });
});
