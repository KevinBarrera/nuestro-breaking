import { describe, expect, it } from 'vitest';
import { passDetailPath, passListPath, passNewPath } from './passes-context';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';

describe('pass screen paths', () => {
  it('builds the list, create and detail paths of an event', () => {
    expect(passListPath(eventId)).toBe(`/admin/events/${eventId}/passes`);
    expect(passNewPath(eventId)).toBe(`/admin/events/${eventId}/passes/new`);
    expect(passDetailPath(eventId, 'f1')).toBe(`/admin/events/${eventId}/passes/f1`);
  });

  it('encodes ids so they stay a single path segment', () => {
    expect(passDetailPath(eventId, 'a/b?c')).toBe(`/admin/events/${eventId}/passes/a%2Fb%3Fc`);
  });
});
