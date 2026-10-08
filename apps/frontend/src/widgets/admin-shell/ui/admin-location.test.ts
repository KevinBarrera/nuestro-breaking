import { describe, expect, it } from 'vitest';
import { eventSectionPath, readAdminLocation } from './admin-location';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const base = `/admin/events/${eventId}`;

describe('readAdminLocation', () => {
  it('keeps Pases current on the list, create and detail routes', () => {
    for (const path of [`${base}/passes`, `${base}/passes/new`, `${base}/passes/f1`])
      expect(readAdminLocation(path)).toEqual({ eventId, section: 'passes' });
  });

  it('matches the other sections exactly', () => {
    expect(readAdminLocation(base)).toEqual({ eventId, section: 'overview' });
    expect(readAdminLocation(`${base}/activities`)).toEqual({ eventId, section: 'activities' });
    expect(readAdminLocation(`${base}/activities/extra`)).toEqual({});
    expect(readAdminLocation(`${base}/passes-archive`)).toEqual({});
    expect(readAdminLocation('/admin')).toEqual({});
  });
});

describe('eventSectionPath', () => {
  it('builds the list path of a section', () => {
    expect(eventSectionPath(eventId, 'passes')).toBe(`${base}/passes`);
  });
});
