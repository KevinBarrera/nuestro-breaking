import { describe, expect, it } from 'vitest';
import {
  createInput,
  emptyEventDraft,
  eventServerErrors,
  previewUrl,
  sampleFolio,
  slugify,
  timeZoneOptions,
  validateEvent,
  type EventDraft,
} from './event-form-model';

const draft = (changes: Partial<EventDraft> = {}): EventDraft => ({
  ...emptyEventDraft,
  name: 'Los más pesados',
  slug: 'los-mas-pesados',
  folioPrefix: 'LMP',
  ...changes,
});

describe('slugify', () => {
  it('lowercases, strips accents and joins words with single hyphens', () => {
    expect(slugify('Los más pesados - Final - Marzo 2027')).toBe(
      'los-mas-pesados-final-marzo-2027',
    );
    expect(slugify('Niñas & Niños: ¡Batalla!')).toBe('ninas-ninos-batalla');
    expect(slugify('  --Ya__está--  ')).toBe('ya-esta');
    expect(slugify('¿?')).toBe('');
  });

  it('keeps at most 80 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`);
    expect(slug).toBe('a'.repeat(79));
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
});

describe('previewUrl and sampleFolio', () => {
  it('builds the purchase address and a sample folio', () => {
    expect(previewUrl('https://example.org', 'final-2027')).toBe(
      'https://example.org/e/final-2027',
    );
    expect(previewUrl('https://example.org', '')).toBe('https://example.org/e/…');
    expect(sampleFolio('LMPF')).toBe('LMPF-7K3Q');
    expect(sampleFolio('')).toBe('…-7K3Q');
  });
});

describe('timeZoneOptions', () => {
  it('starts with Mexico City and labels each zone with its IANA name', () => {
    expect(emptyEventDraft.timeZone).toBe('America/Mexico_City');
    expect(timeZoneOptions[0]).toEqual({
      id: 'America/Mexico_City',
      label: 'Ciudad de México (America/Mexico_City)',
    });
    for (const option of timeZoneOptions) expect(option.label).toContain(`(${option.id})`);
  });
});

describe('validateEvent', () => {
  it('accepts a complete draft without dates', () => {
    expect(validateEvent(draft())).toEqual({});
  });

  it('requires a name of at most 120 characters without control characters', () => {
    expect(validateEvent(draft({ name: '   ' })).name).toBe('Escribe el nombre del evento.');
    expect(validateEvent(draft({ name: 'a'.repeat(121) })).name).toBe(
      'Usa 120 caracteres o menos.',
    );
    expect(validateEvent(draft({ name: 'a\u0007b' })).name).toBeDefined();
  });

  it('checks the slug rule', () => {
    expect(validateEvent(draft({ slug: '' })).slug).toBe('Escribe la dirección.');
    for (const slug of ['Mayus', 'dos--guiones', '-inicio', 'con espacio', 'a'.repeat(81)])
      expect(validateEvent(draft({ slug })).slug).toBe(
        'Usa solo minúsculas, números y guiones, hasta 80 caracteres.',
      );
  });

  it('checks the folio prefix rule', () => {
    for (const folioPrefix of ['A', '1AB', 'ABCDEFG', 'AB-1', 'ab'])
      expect(validateEvent(draft({ folioPrefix })).folioPrefix).toBe(
        'Usa de 2 a 6 letras mayúsculas o números, empezando con una letra.',
      );
    expect(validateEvent(draft({ folioPrefix: 'A1' })).folioPrefix).toBeUndefined();
  });

  it('wants both dates or neither, with the end after the start', () => {
    expect(validateEvent(draft({ startsAt: '2026-11-21T10:00' })).endsAt).toBe(
      'Escribe también la fecha de fin.',
    );
    expect(validateEvent(draft({ endsAt: '2026-11-21T10:00' })).startsAt).toBe(
      'Escribe también la fecha de inicio.',
    );
    expect(
      validateEvent(draft({ startsAt: '2026-11-21T10:00', endsAt: '2026-11-21T10:00' })).endsAt,
    ).toBe('El fin debe ser después del inicio.');
    expect(
      validateEvent(draft({ startsAt: '2026-11-21T10:00', endsAt: '2026-11-22T22:00' })),
    ).toEqual({});
  });

  it('refuses a wall-clock time the time zone skips', () => {
    const errors = validateEvent(
      draft({
        timeZone: 'America/Tijuana',
        startsAt: '2027-03-14T02:30',
        endsAt: '2027-03-15T10:00',
      }),
    );
    expect(errors.startsAt).toBe('Esa hora no existe en la zona horaria elegida. Elige otra.');
  });
});

describe('createInput', () => {
  it('trims the name and converts the dates to instants on the event clock', () => {
    expect(
      createInput(
        draft({ name: '  Final  ', startsAt: '2026-11-21T10:00', endsAt: '2026-11-22T22:00' }),
      ),
    ).toEqual({
      name: 'Final',
      slug: 'los-mas-pesados',
      folioPrefix: 'LMP',
      timeZone: 'America/Mexico_City',
      startsAt: '2026-11-21T16:00:00.000Z',
      endsAt: '2026-11-23T04:00:00.000Z',
    });
    expect(createInput(draft())).toMatchObject({ startsAt: null, endsAt: null });
  });
});

describe('eventServerErrors', () => {
  it('maps backend field error codes to field messages', () => {
    expect(
      eventServerErrors({
        name: 'invalid',
        slug: 'taken',
        folioPrefix: 'invalid',
        timeZone: 'invalid',
      }),
    ).toEqual({
      name: 'Revisa el nombre.',
      slug: 'Esta dirección ya la usa otro evento. Elige otra.',
      folioPrefix: 'Usa de 2 a 6 letras mayúsculas o números, empezando con una letra.',
      timeZone: 'Elige una zona horaria de la lista.',
    });
    expect(eventServerErrors({ slug: 'invalid', endsAt: 'invalid' })).toEqual({
      slug: 'Usa solo minúsculas, números y guiones, hasta 80 caracteres.',
      endsAt: 'Revisa la fecha de fin: debe ser después del inicio.',
    });
    expect(eventServerErrors({ body: 'invalid' })).toEqual({});
  });
});
