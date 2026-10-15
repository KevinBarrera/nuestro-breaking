import {
  eventWindowErrors,
  parseCreateEventInput,
  parseDeleteEventInput,
  parseUpdateEventInput,
} from './admin-event-input';

const valid = {
  name: '  Los más pesados 2026  ',
  slug: 'los-mas-pesados-2026',
  folioPrefix: 'LMP',
  timeZone: 'America/Mexico_City',
  startsAt: '2026-11-14T10:00:00-06:00',
  endsAt: '2026-11-15T20:00:00-06:00',
};

describe('parseCreateEventInput', () => {
  it('returns the trimmed name, the canonical time zone and the parsed dates', () => {
    expect(parseCreateEventInput({ ...valid, timeZone: 'america/mexico_city' })).toEqual({
      ok: true,
      value: {
        name: 'Los más pesados 2026',
        slug: 'los-mas-pesados-2026',
        folioPrefix: 'LMP',
        timeZone: 'America/Mexico_City',
        startsAt: new Date('2026-11-14T16:00:00.000Z'),
        endsAt: new Date('2026-11-16T02:00:00.000Z'),
      },
    });
  });

  it('accepts an event without dates, missing or null', () => {
    const withoutDates = {
      name: valid.name,
      slug: valid.slug,
      folioPrefix: 'LMP',
      timeZone: 'UTC',
    };
    for (const body of [withoutDates, { ...valid, startsAt: null, endsAt: null }]) {
      const result = parseCreateEventInput(body);
      expect(result).toMatchObject({ ok: true, value: { startsAt: null, endsAt: null } });
    }
  });

  it.each([
    [null, { body: 'invalid' }],
    [[], { body: 'invalid' }],
    ['event', { body: 'invalid' }],
  ])('refuses a body that is not an object (%p)', (body, fieldErrors) => {
    expect(parseCreateEventInput(body)).toEqual({ ok: false, fieldErrors });
  });

  it.each([
    ['name', '   '],
    ['name', 'Line\nbreak'],
    ['name', 'x'.repeat(121)],
    ['name', 42],
    ['slug', 'Los-Mas-Pesados'],
    ['slug', 'los--mas'],
    ['slug', '-los'],
    ['slug', 'los mas'],
    ['slug', 'a'.repeat(81)],
    ['slug', undefined],
    ['folioPrefix', 'lmp'],
    ['folioPrefix', 'L'],
    ['folioPrefix', 'LMPLMPL'],
    ['folioPrefix', '1MP'],
    ['timeZone', 'Mars/Olympus_Mons'],
    ['timeZone', '+01:00'],
    ['timeZone', ''],
    ['timeZone', 7],
    ['startsAt', '2026-11-14T10:00:00'],
    ['startsAt', '2026-02-31T10:00:00Z'],
    ['endsAt', 1_700_000_000_000],
  ])('reports %s as invalid for %p', (field, value) => {
    const result = parseCreateEventInput({ ...valid, [field]: value });
    expect(result).toEqual({ ok: false, fieldErrors: { [field]: 'invalid' } });
  });

  it('accepts the longest slug, name and folio prefix', () => {
    const result = parseCreateEventInput({
      ...valid,
      name: 'x'.repeat(120),
      slug: 'a'.repeat(80),
      folioPrefix: 'LMP26X',
    });
    expect(result.ok).toBe(true);
  });

  it('reports every invalid field at once', () => {
    expect(
      parseCreateEventInput({ name: '', slug: 'Bad', folioPrefix: 'x', timeZone: 'Nowhere' }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        name: 'invalid',
        slug: 'invalid',
        folioPrefix: 'invalid',
        timeZone: 'invalid',
      },
    });
  });

  it('requires both dates or neither, with the start before the end', () => {
    expect(parseCreateEventInput({ ...valid, endsAt: null })).toEqual({
      ok: false,
      fieldErrors: { endsAt: 'invalid' },
    });
    expect(parseCreateEventInput({ ...valid, startsAt: undefined })).toEqual({
      ok: false,
      fieldErrors: { startsAt: 'invalid' },
    });
    expect(parseCreateEventInput({ ...valid, endsAt: valid.startsAt })).toEqual({
      ok: false,
      fieldErrors: { endsAt: 'invalid' },
    });
  });
});

describe('parseUpdateEventInput', () => {
  it('returns only the supplied fields', () => {
    expect(parseUpdateEventInput({ name: ' Nuevo nombre ' })).toEqual({
      ok: true,
      value: { name: 'Nuevo nombre' },
    });
    expect(
      parseUpdateEventInput({ timeZone: 'America/Bogota', startsAt: null, endsAt: null }),
    ).toEqual({ ok: true, value: { timeZone: 'America/Bogota', startsAt: null, endsAt: null } });
  });

  it('returns a single date so it can be checked against the stored one', () => {
    expect(parseUpdateEventInput({ endsAt: '2026-11-15T20:00:00Z' })).toEqual({
      ok: true,
      value: { endsAt: new Date('2026-11-15T20:00:00.000Z') },
    });
  });

  it('checks the pairing when both dates are supplied', () => {
    expect(parseUpdateEventInput({ startsAt: valid.startsAt, endsAt: null })).toEqual({
      ok: false,
      fieldErrors: { endsAt: 'invalid' },
    });
    expect(parseUpdateEventInput({ startsAt: valid.endsAt, endsAt: valid.startsAt })).toEqual({
      ok: false,
      fieldErrors: { endsAt: 'invalid' },
    });
  });

  it('refuses the slug and the folio prefix as immutable and unknown fields as invalid', () => {
    expect(
      parseUpdateEventInput({ name: 'Ok', slug: 'otro', folioPrefix: 'OTR', salesEnabled: true }),
    ).toEqual({
      ok: false,
      fieldErrors: { slug: 'immutable', folioPrefix: 'immutable', salesEnabled: 'invalid' },
    });
  });

  it('requires at least one field', () => {
    expect(parseUpdateEventInput({})).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
    expect(parseUpdateEventInput(null)).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
  });

  it('validates each supplied field like creation does', () => {
    expect(parseUpdateEventInput({ name: '', timeZone: 'Nowhere', startsAt: 'soon' })).toEqual({
      ok: false,
      fieldErrors: { name: 'invalid', timeZone: 'invalid', startsAt: 'invalid' },
    });
  });
});

describe('eventWindowErrors', () => {
  const start = new Date('2026-11-14T16:00:00Z');
  const end = new Date('2026-11-15T02:00:00Z');

  it('accepts both dates in order or neither', () => {
    expect(eventWindowErrors(start, end)).toEqual({});
    expect(eventWindowErrors(null, null)).toEqual({});
  });

  it('names the missing or out-of-order date', () => {
    expect(eventWindowErrors(start, null)).toEqual({ endsAt: 'invalid' });
    expect(eventWindowErrors(null, end)).toEqual({ startsAt: 'invalid' });
    expect(eventWindowErrors(end, start)).toEqual({ endsAt: 'invalid' });
    expect(eventWindowErrors(start, start)).toEqual({ endsAt: 'invalid' });
  });
});

describe('parseDeleteEventInput', () => {
  it('keeps the typed slug exactly as sent', () => {
    expect(parseDeleteEventInput({ confirmSlug: ' lmp ' })).toEqual({
      ok: true,
      value: { confirmSlug: ' lmp ' },
    });
  });

  it('requires a string confirmation', () => {
    for (const body of [undefined, null, {}, { confirmSlug: 7 }, 'lmp'])
      expect(parseDeleteEventInput(body)).toEqual({
        ok: false,
        fieldErrors: { confirmSlug: 'invalid' },
      });
  });
});
