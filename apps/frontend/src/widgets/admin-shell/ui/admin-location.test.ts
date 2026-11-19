import { describe, expect, it } from 'vitest';
import { eventSectionPath, readAdminLocation } from './admin-location';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const base = `/admin/events/${eventId}`;

describe('readAdminLocation', () => {
  it('keeps Pases current on the list, create and detail routes', () => {
    for (const path of [`${base}/passes`, `${base}/passes/new`, `${base}/passes/f1`])
      expect(readAdminLocation(path)).toEqual({ eventId, section: 'passes' });
  });

  it('keeps Inscripciones current on the search, new and registration routes', () => {
    for (const path of [
      `${base}/registrations`,
      `${base}/registrations/new`,
      `${base}/registrations/c1b2c3d4-1234-4567-89ab-123456789abc`,
      `${base}/registrations/c1b2c3d4-1234-4567-89ab-123456789abc/sale`,
    ])
      expect(readAdminLocation(path)).toEqual({ eventId, section: 'registrations' });
  });

  it('matches the other sections exactly', () => {
    expect(readAdminLocation(base)).toEqual({ eventId, section: 'overview' });
    expect(readAdminLocation(`${base}/activities`)).toEqual({ eventId, section: 'activities' });
    expect(readAdminLocation(`${base}/payments-review`)).toEqual({
      eventId,
      section: 'payments-review',
    });
    expect(readAdminLocation(`${base}/lists`)).toEqual({ eventId, section: 'lists' });
    expect(readAdminLocation(`${base}/lists/extra`)).toEqual({});
    expect(readAdminLocation(`${base}/history`)).toEqual({ eventId, section: 'history' });
    expect(readAdminLocation(`${base}/history/extra`)).toEqual({});
    expect(readAdminLocation(`${base}/activities/extra`)).toEqual({});
    expect(readAdminLocation(`${base}/passes-archive`)).toEqual({});
    expect(readAdminLocation('/admin')).toEqual({});
    expect(readAdminLocation('/admin/events/new')).toEqual({});
  });
});

describe('eventSectionPath', () => {
  it('builds the list path of a section', () => {
    expect(eventSectionPath(eventId, 'passes')).toBe(`${base}/passes`);
    expect(eventSectionPath(eventId, 'registrations')).toBe(`${base}/registrations`);
    expect(eventSectionPath(eventId, 'lists')).toBe(`${base}/lists`);
    expect(eventSectionPath(eventId, 'history')).toBe(`${base}/history`);
  });
});
