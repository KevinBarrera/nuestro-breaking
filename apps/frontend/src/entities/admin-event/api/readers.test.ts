import { describe, expect, it } from 'vitest';
import {
  readAdminEvent,
  readEventFailure,
  readEventFoundation,
  readEventList,
  readVenue,
} from './readers';

const id = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const summary = {
  id,
  name: 'Los más pesados',
  slug: 'los-mas-pesados-2026',
  folioPrefix: 'LMP',
  archivedAt: null,
};
const event = {
  ...summary,
  timeZone: 'America/Mexico_City',
  startsAt: '2026-11-21T16:00:00.000Z',
  endsAt: '2026-11-23T04:00:00.000Z',
  salesEnabled: false,
};

describe('readEventList', () => {
  it('reads active and archived events with their dates and sales switch, ignoring extra fields', () => {
    const archived = { ...event, archivedAt: '2026-10-01T10:00:00.000Z', extra: true };
    expect(readEventList([event, archived])).toEqual([
      event,
      { ...event, archivedAt: '2026-10-01T10:00:00.000Z' },
    ]);
  });

  it('rejects the whole list when one entry is malformed', () => {
    for (const bad of [
      { ...event, id: 'sample' },
      { ...event, name: '  ' },
      { ...event, slug: undefined },
      { ...event, folioPrefix: 3 },
      { ...event, archivedAt: 'yesterday' },
      { ...event, archivedAt: undefined },
      summary,
      { ...event, salesEnabled: undefined },
    ])
      expect(readEventList([event, bad])).toBeNull();
    expect(readEventList({ events: [] })).toBeNull();
  });
});

describe('readAdminEvent', () => {
  it('reads the full event', () => {
    expect(readAdminEvent(event)).toEqual(event);
    expect(readAdminEvent({ ...event, startsAt: null, endsAt: null })).toEqual({
      ...event,
      startsAt: null,
      endsAt: null,
    });
  });

  it('rejects a malformed event', () => {
    expect(readAdminEvent({ ...event, salesEnabled: 'no' })).toBeNull();
    expect(readAdminEvent({ ...event, timeZone: 1 })).toBeNull();
    expect(readAdminEvent({ ...event, endsAt: 'later' })).toBeNull();
    expect(readAdminEvent(summary)).toBeNull();
  });
});

describe('readEventFoundation', () => {
  const venues = [{ id: 'v1', name: 'Centro cultural' }];

  it('reads the event and its venues, ignoring activities and extra fields', () => {
    expect(
      readEventFoundation({
        event: { ...event, windowStatus: 'bounded' },
        venues,
        activities: [{ id: 'x' }],
        deleteBlockers: ['registrations', 'activities'],
        deferredFields: [],
      }),
    ).toEqual({ event, venues, deleteBlockers: ['activities', 'registrations'] });
  });

  it('reads an empty blocker list as deletable and anything else as not known', () => {
    expect(readEventFoundation({ event, venues, deleteBlockers: [] })?.deleteBlockers).toEqual([]);
    for (const deleteBlockers of [undefined, null, 'activities', ['activities', 'payments']])
      expect(readEventFoundation({ event, venues, deleteBlockers })?.deleteBlockers).toBeNull();
  });

  it('rejects a foundation with a malformed event or venue', () => {
    expect(readEventFoundation({ event: summary, venues })).toBeNull();
    expect(readEventFoundation({ event, venues: [{ id: 'v1' }] })).toBeNull();
    expect(readEventFoundation({ event, venues: null })).toBeNull();
    expect(readEventFoundation([])).toBeNull();
  });
});

describe('readVenue', () => {
  it('reads a venue and rejects anything else', () => {
    expect(readVenue({ id: 'v1', name: 'Centro', extra: 1 })).toEqual({ id: 'v1', name: 'Centro' });
    expect(readVenue({ id: 'v1' })).toBeNull();
    expect(readVenue(null)).toBeNull();
  });
});

describe('readEventFailure', () => {
  it('maps 401 and 403 apart', () => {
    expect(readEventFailure(401, {})).toEqual({ kind: 'unauthorized' });
    expect(readEventFailure(403, {})).toEqual({ kind: 'forbidden' });
  });

  it('keeps only string field error codes on a 400', () => {
    expect(
      readEventFailure(400, {
        message: 'Invalid event',
        fieldErrors: { slug: 'invalid', name: 7, folioPrefix: 'immutable' },
      }),
    ).toEqual({ kind: 'invalid', fieldErrors: { slug: 'invalid', folioPrefix: 'immutable' } });
    expect(readEventFailure(400, null)).toEqual({ kind: 'invalid', fieldErrors: {} });
  });

  it('maps known 409 codes and a 404 without a code', () => {
    for (const code of [
      'slug_taken',
      'organization_ambiguous',
      'event_archived',
      'event_not_archived',
      'venue_shared',
    ] as const)
      expect(readEventFailure(409, { code })).toEqual({ kind: 'rule', code });
    expect(readEventFailure(404, { message: 'Event not found' })).toEqual({ kind: 'not_found' });
  });

  it('reads the delete blockers, dropping unknown ones', () => {
    expect(
      readEventFailure(409, {
        code: 'event_not_empty',
        blockers: ['activities', 'secret', 'registrations'],
      }),
    ).toEqual({ kind: 'not_empty', blockers: ['activities', 'registrations'] });
    expect(readEventFailure(409, { code: 'event_not_empty' })).toEqual({
      kind: 'not_empty',
      blockers: [],
    });
  });

  it('treats unknown codes and statuses as a plain error', () => {
    expect(readEventFailure(409, { code: 'something_else' })).toEqual({ kind: 'error' });
    expect(readEventFailure(500, { message: 'private' })).toEqual({ kind: 'error' });
  });
});
