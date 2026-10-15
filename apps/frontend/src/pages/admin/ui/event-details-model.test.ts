import type { AdminEvent } from '@/entities/admin-event';
import { describe, expect, it } from 'vitest';
import {
  detailsChanges,
  detailsDraft,
  detailsZoneOptions,
  isDetailsDirty,
  validateDetails,
  validateVenueName,
  venueFailureMessage,
} from './event-details-model';

const event: AdminEvent = {
  id: 'a1b2c3d4-1234-4567-89ab-123456789abc',
  name: 'Los más pesados',
  slug: 'los-mas-pesados',
  folioPrefix: 'LMP',
  archivedAt: null,
  timeZone: 'America/Mexico_City',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-16T02:00:00.000Z',
  salesEnabled: false,
};

describe('detailsDraft', () => {
  it('shows the stored dates on the event clock', () => {
    expect(detailsDraft(event)).toEqual({
      name: 'Los más pesados',
      timeZone: 'America/Mexico_City',
      startsAt: '2026-11-14T10:00',
      endsAt: '2026-11-15T20:00',
    });
    expect(detailsDraft({ ...event, startsAt: null, endsAt: null })).toMatchObject({
      startsAt: '',
      endsAt: '',
    });
  });

  it('round-trips the stored instants unchanged', () => {
    expect(detailsChanges(event, detailsDraft(event))).toEqual({});
  });
});

describe('isDetailsDirty', () => {
  it('compares the draft with the loaded values, field by field', () => {
    const initial = detailsDraft(event);
    expect(isDetailsDirty(initial, initial)).toBe(false);
    expect(isDetailsDirty(initial, { ...initial })).toBe(false);
    expect(isDetailsDirty(initial, { ...initial, name: 'Otro' })).toBe(true);
    expect(isDetailsDirty(initial, { ...initial, endsAt: '' })).toBe(true);
  });
});

describe('detailsChanges', () => {
  it('sends only the changed fields, with the name trimmed', () => {
    const draft = detailsDraft(event);
    expect(detailsChanges(event, { ...draft, name: '  Los más pesados  ' })).toEqual({});
    expect(detailsChanges(event, { ...draft, name: ' Nuevo nombre ' })).toEqual({
      name: 'Nuevo nombre',
    });
    expect(detailsChanges(event, { ...draft, endsAt: '2026-11-15T22:00' })).toEqual({
      endsAt: '2026-11-16T04:00:00.000Z',
    });
  });

  it('clears both dates as null', () => {
    expect(detailsChanges(event, { ...detailsDraft(event), startsAt: '', endsAt: '' })).toEqual({
      startsAt: null,
      endsAt: null,
    });
  });

  it('keeps the typed clock times when the zone changes, so the instants move', () => {
    const draft = { ...detailsDraft(event), timeZone: 'America/Tijuana' };
    expect(detailsChanges(event, draft)).toEqual({
      timeZone: 'America/Tijuana',
      startsAt: '2026-11-14T18:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
    });
  });

  it('sets dates on an event that had none', () => {
    const undated = { ...event, startsAt: null, endsAt: null };
    expect(
      detailsChanges(undated, {
        ...detailsDraft(undated),
        startsAt: '2026-11-14T10:00',
        endsAt: '2026-11-15T20:00',
      }),
    ).toEqual({ startsAt: event.startsAt, endsAt: event.endsAt });
  });
});

describe('detailsZoneOptions and validateDetails', () => {
  it('keeps a stored zone outside the short list selectable and valid', () => {
    const madrid = { ...event, timeZone: 'Europe/Madrid' };
    const options = detailsZoneOptions(madrid.timeZone);
    expect(options[0]).toEqual({ id: 'Europe/Madrid', label: 'Europe/Madrid' });
    expect(options).toHaveLength(9);
    expect(detailsZoneOptions(event.timeZone)).toHaveLength(8);
    expect(validateDetails(madrid, detailsDraft(madrid))).toEqual({});
    expect(validateDetails(event, { ...detailsDraft(event), timeZone: 'Europe/Madrid' })).toEqual({
      timeZone: 'Elige una zona horaria de la lista.',
    });
  });

  it('applies the create rules to the name and dates', () => {
    const draft = detailsDraft(event);
    expect(validateDetails(event, { ...draft, name: ' ' })).toEqual({
      name: 'Escribe el nombre del evento.',
    });
    expect(validateDetails(event, { ...draft, endsAt: '' })).toEqual({
      endsAt: 'Escribe también la fecha de fin.',
    });
    expect(validateDetails(event, { ...draft, endsAt: '2026-11-14T09:00' })).toEqual({
      endsAt: 'El fin debe ser después del inicio.',
    });
  });
});

describe('validateVenueName', () => {
  it('follows the backend venue rule', () => {
    expect(validateVenueName('Foro Principal')).toBeUndefined();
    expect(validateVenueName('  ')).toBe('Escribe el nombre de la sede.');
    expect(validateVenueName('x'.repeat(121))).toBe('Usa 120 caracteres o menos.');
    expect(validateVenueName('Foro\u0007')).toBe('Quita los caracteres especiales del nombre.');
  });
});

describe('venueFailureMessage', () => {
  it('explains a shared venue and an archived event', () => {
    expect(venueFailureMessage({ kind: 'rule', code: 'venue_shared' })).toContain(
      'también la usa otro evento',
    );
    expect(venueFailureMessage({ kind: 'rule', code: 'event_archived' })).toContain('archivado');
    expect(venueFailureMessage({ kind: 'not_found' })).toContain('Recarga la página');
    expect(venueFailureMessage({ kind: 'invalid', fieldErrors: { name: 'invalid' } })).toBe(
      'Revisa el nombre de la sede.',
    );
  });
});
