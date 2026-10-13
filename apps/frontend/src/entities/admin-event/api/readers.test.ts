import { describe, expect, it } from 'vitest';
import { readAdminEvent, readEventFailure, readEventSummaries, readVenue } from './readers';

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

describe('readEventSummaries', () => {
  it('reads active and archived summaries and ignores extra fields', () => {
    const archived = { ...summary, archivedAt: '2026-10-01T10:00:00.000Z', extra: true };
    expect(readEventSummaries([summary, archived])).toEqual([
      summary,
      { ...summary, archivedAt: '2026-10-01T10:00:00.000Z' },
    ]);
  });

  it('rejects the whole list when one entry is malformed', () => {
    for (const bad of [
      { ...summary, id: 'sample' },
      { ...summary, name: '  ' },
      { ...summary, slug: undefined },
      { ...summary, folioPrefix: 3 },
      { ...summary, archivedAt: 'yesterday' },
      { ...summary, archivedAt: undefined },
    ])
      expect(readEventSummaries([summary, bad])).toBeNull();
    expect(readEventSummaries({ events: [] })).toBeNull();
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
