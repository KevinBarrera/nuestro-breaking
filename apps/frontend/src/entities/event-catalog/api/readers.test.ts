import { describe, expect, it } from 'vitest';
import {
  isCatalogActivity,
  isCatalogEventSummary,
  isCatalogPassType,
  readEventContext,
} from './readers';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const otherEventId = 'b1b2c3d4-1234-4567-89ab-123456789abc';

const activity = {
  id: 'd1b2c3d4-1234-4567-89ab-123456789abc',
  eventId,
  venueId: 'e1b2c3d4-1234-4567-89ab-123456789abc',
  kind: 'battle',
  name: 'Batalla de crews',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T18:00:00.000Z',
  status: 'active',
  version: 1,
};

const passType = {
  id: 'f1b2c3d4-1234-4567-89ab-123456789abc',
  eventId,
  name: 'Open Styles',
  passClass: 'add_on',
  priceCents: 25000,
  requiresPassClass: 'full',
  status: 'active',
  version: 2,
  activities: [{ activityId: activity.id, access: 'selectable' }],
};

const foundation = {
  event: { id: eventId, timeZone: 'America/Mexico_City' },
  venues: [{ id: activity.venueId, name: 'Centro cultural' }],
};

describe('isCatalogActivity', () => {
  it('accepts a well-formed activity of the requested event', () => {
    expect(isCatalogActivity(activity, eventId)).toBe(true);
    expect(isCatalogActivity({ ...activity, status: 'archived', version: 7 }, eventId)).toBe(true);
  });

  it('rejects an activity of another event', () => {
    expect(isCatalogActivity(activity, otherEventId)).toBe(false);
  });

  it.each([
    ['an empty id', { id: '' }],
    ['a numeric id', { id: 42 }],
    ['a missing venue', { venueId: undefined }],
    ['an empty name', { name: '' }],
    ['an unparseable start', { startsAt: 'tomorrow' }],
    ['a numeric end', { endsAt: 1763137200000 }],
    ['an unknown status', { status: 'deleted' }],
    ['a zero version', { version: 0 }],
    ['a fractional version', { version: 1.5 }],
  ])('rejects an activity with %s', (_, change) => {
    expect(isCatalogActivity({ ...activity, ...change }, eventId)).toBe(false);
  });

  it.each([null, undefined, 'activity', [activity]])('rejects the non-object %j', (value) => {
    expect(isCatalogActivity(value, eventId)).toBe(false);
  });
});

describe('isCatalogEventSummary', () => {
  it('accepts an event with an id and a name', () => {
    expect(isCatalogEventSummary({ id: eventId, name: 'Encuentro del barrio' })).toBe(true);
  });

  it.each([{ id: eventId }, { id: '', name: 'Encuentro' }, { id: 1, name: 'Encuentro' }, null])(
    'rejects the malformed summary %j',
    (value) => {
      expect(isCatalogEventSummary(value)).toBe(false);
    },
  );
});

describe('isCatalogPassType', () => {
  it('accepts a well-formed pass type of the requested event', () => {
    expect(isCatalogPassType(passType, eventId)).toBe(true);
    expect(
      isCatalogPassType(
        { ...passType, passClass: 'full', priceCents: 0, requiresPassClass: null, activities: [] },
        eventId,
      ),
    ).toBe(true);
  });

  it('rejects a pass type of another event', () => {
    expect(isCatalogPassType(passType, otherEventId)).toBe(false);
  });

  it.each([
    ['an empty id', { id: '' }],
    ['an unknown pass class', { passClass: 'vip' }],
    ['a negative price', { priceCents: -1 }],
    ['a fractional price', { priceCents: 100.5 }],
    ['a price sent as text', { priceCents: '25000' }],
    ['a required add-on class', { requiresPassClass: 'add_on' }],
    ['a missing required class', { requiresPassClass: undefined }],
    ['an unknown status', { status: 'draft' }],
    ['a missing version', { version: undefined }],
    ['activities that are not a list', { activities: {} }],
    ['an activity with an empty id', { activities: [{ activityId: '', access: 'included' }] }],
    ['an unknown access', { activities: [{ activityId: activity.id, access: 'optional' }] }],
  ])('rejects a pass type with %s', (_, change) => {
    expect(isCatalogPassType({ ...passType, ...change }, eventId)).toBe(false);
  });
});

describe('readEventContext', () => {
  it('reads the event time zone and its venues', () => {
    expect(readEventContext(foundation)).toEqual({
      timeZone: 'America/Mexico_City',
      venues: [{ id: activity.venueId, name: 'Centro cultural' }],
    });
  });

  it('keeps only the venue id and name', () => {
    const venues = [{ id: activity.venueId, name: 'Centro cultural', capacity: 300 }];
    expect(readEventContext({ ...foundation, venues })?.venues).toEqual([
      { id: activity.venueId, name: 'Centro cultural' },
    ]);
  });

  it.each([
    ['a missing event', { venues: foundation.venues }],
    ['an unknown time zone', { ...foundation, event: { timeZone: 'Mars/Olympus_Mons' } }],
    ['an empty time zone', { ...foundation, event: { timeZone: '' } }],
    ['venues that are not a list', { ...foundation, venues: {} }],
    ['a venue without a name', { ...foundation, venues: [{ id: activity.venueId }] }],
    ['a venue that is not an object', { ...foundation, venues: ['Centro cultural'] }],
    ['a payload that is not an object', 'foundation'],
  ])('rejects a foundation with %s', (_, value) => {
    expect(readEventContext(value)).toBeNull();
  });
});
