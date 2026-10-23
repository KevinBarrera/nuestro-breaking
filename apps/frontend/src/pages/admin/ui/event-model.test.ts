import type { AdminEventFailure, AdminEvent } from '@/entities/admin-event';
import { describe, expect, it } from 'vitest';
import {
  eventDates,
  eventFailureMessage,
  eventZoneName,
  landingRedirect,
  restoredNotice,
  salesChip,
  splitEvents,
  eventLocation,
  eventDateTile,
} from './event-model';
import { slugTakenMessage } from './event-form-model';

const event = (id: string, archivedAt: string | null = null): AdminEvent => ({
  id,
  name: `Evento ${id}`,
  slug: `evento-${id}`,
  folioPrefix: 'EV',
  archivedAt,
  timeZone: 'America/Mexico_City',
  startsAt: null,
  endsAt: null,
  salesEnabled: false,
  city: null,
  state: null,
  country: null,
});

describe('splitEvents', () => {
  it('separates active and archived events, keeping the order', () => {
    const list = [event('a'), event('b', '2026-10-01T10:00:00.000Z'), event('c')];
    expect(splitEvents(list)).toEqual({ active: [list[0], list[2]], archived: [list[1]] });
  });
});

describe('landingRedirect', () => {
  it('opens the only active event for accounts that cannot create events', () => {
    expect(landingRedirect([event('a')], false)).toBe('a');
    expect(landingRedirect([event('a'), event('b')], false)).toBeNull();
    expect(landingRedirect([], false)).toBeNull();
  });

  it('never redirects a global admin, who needs the list to create and restore', () => {
    expect(landingRedirect([event('a')], true)).toBeNull();
  });
});

describe('restoredNotice', () => {
  it('names the event and says sales stay closed', () => {
    expect(restoredNotice('Batalla')).toContain('«Batalla»');
    expect(restoredNotice('Batalla')).toContain('venta en línea sigue cerrada');
  });
});

describe('eventFailureMessage', () => {
  it('has Spanish copy for every failure kind', () => {
    const failures: AdminEventFailure[] = [
      { kind: 'unauthorized' },
      { kind: 'forbidden' },
      { kind: 'invalid', fieldErrors: {} },
      { kind: 'rule', code: 'slug_taken' },
      { kind: 'rule', code: 'organization_ambiguous' },
      { kind: 'rule', code: 'event_archived' },
      { kind: 'rule', code: 'event_not_archived' },
      { kind: 'rule', code: 'venue_shared' },
      { kind: 'not_empty', blockers: ['activities'] },
      { kind: 'not_found' },
      { kind: 'unknown' },
      { kind: 'error' },
    ];
    for (const failure of failures) expect(eventFailureMessage(failure)).toMatch(/\S/);
    expect(eventFailureMessage({ kind: 'unauthorized' })).toBe(
      eventFailureMessage({ kind: 'forbidden' }),
    );
  });
});

describe('eventDates', () => {
  it('says the dates are not set yet when the event has none', () => {
    expect(eventDates(event('a'))).toBe('Fechas por definir');
  });

  it('shows the days on the event clock, collapsing a shared month', () => {
    const dated = {
      ...event('a'),
      startsAt: '2026-11-14T16:00:00.000Z',
      // 22:00 on the 15th in Mexico City, already the 16th in UTC.
      endsAt: '2026-11-16T04:00:00.000Z',
    };
    expect(eventDates(dated)).toBe('14–15 de noviembre de 2026');
    expect(eventDates({ ...dated, timeZone: 'Etc/UTC' })).toBe('14–16 de noviembre de 2026');
    expect(eventDates({ ...dated, endsAt: '2026-11-14T20:00:00.000Z' })).toBe(
      '14 de noviembre de 2026',
    );
  });
});

describe('eventZoneName', () => {
  it('names a listed zone by its city and falls back to the zone id', () => {
    expect(eventZoneName('America/Mexico_City')).toBe('Ciudad de México');
    expect(eventZoneName('Europe/Madrid')).toBe('Europe/Madrid');
  });
});

describe('eventDateTile', () => {
  const dated = (startsAt: string, endsAt: string) => ({
    ...event('a'),
    startsAt,
    endsAt,
  });

  it('shows the month and the days on the event clock', () => {
    expect(eventDateTile(dated('2026-11-21T16:00:00.000Z', '2026-11-23T04:00:00.000Z'))).toEqual({
      month: 'Nov 2026',
      days: '21–22',
    });
  });

  it('shows one day for a one-day event and both months across a month change', () => {
    expect(eventDateTile(dated('2026-11-21T16:00:00.000Z', '2026-11-22T04:00:00.000Z'))).toEqual({
      month: 'Nov 2026',
      days: '21',
    });
    expect(eventDateTile(dated('2026-11-30T16:00:00.000Z', '2026-12-02T04:00:00.000Z'))).toEqual({
      month: 'Nov–Dic 2026',
      days: '30–1',
    });
  });

  it('is empty while the dates are not set', () => {
    expect(eventDateTile(event('a'))).toBeNull();
  });
});

describe('eventLocation', () => {
  it('names the city and state, and the country outside Mexico', () => {
    const located = (city: string, state: string, country: string) => ({
      ...event('a'),
      city,
      state,
      country,
    });
    expect(eventLocation(located('Guadalajara', 'Jalisco', 'MX'))).toBe('Guadalajara, Jalisco');
    expect(eventLocation(located('Ciudad de México', 'Ciudad de México', 'MX'))).toBe(
      'Ciudad de México',
    );
    expect(eventLocation(located('Bogotá', 'Cundinamarca', 'CO'))).toBe(
      'Bogotá, Cundinamarca, Colombia',
    );
  });

  it('is empty without a location, never the time zone', () => {
    expect(eventLocation(event('a'))).toBeNull();
  });
});

describe('salesChip', () => {
  it('follows the sales switch', () => {
    expect(salesChip(true)).toEqual({ label: 'Venta abierta', tone: 'open' });
    expect(salesChip(false)).toEqual({ label: 'Venta cerrada', tone: 'closed' });
  });
});

describe('slug_taken copy', () => {
  it('is the same on the form field and in the failure message', () => {
    expect(eventFailureMessage({ kind: 'rule', code: 'slug_taken' })).toBe(slugTakenMessage);
  });
});
