import { describe, expect, it } from 'vitest';
import { readTeam, readTeamFailure } from './readers';

const member = {
  id: 'u1',
  displayName: 'Ana',
  email: 'ana@example.org',
  status: 'pending',
  access: { kind: 'events', events: [{ id: 'e1', name: 'Preliminares' }] },
  invitation: { expiresAt: '2026-10-14T18:20:00.000Z', expired: false },
};

describe('readTeam', () => {
  it('reads members with global or event access', () => {
    const global = { ...member, id: 'u2', access: { kind: 'global' }, invitation: null };
    expect(readTeam({ members: [member, global] })).toEqual([member, global]);
  });

  it('rejects the whole list when one member is malformed', () => {
    expect(readTeam({ members: [member, { ...member, status: 'unknown' }] })).toBeNull();
    expect(readTeam({ members: [{ ...member, access: { kind: 'events' } }] })).toBeNull();
    expect(readTeam({ members: [{ ...member, invitation: { expiresAt: 'soon' } }] })).toBeNull();
    expect(readTeam([member])).toBeNull();
  });
});

describe('readTeamFailure', () => {
  it('maps 401 and 403 to denied', () => {
    expect(readTeamFailure(401, null)).toEqual({ kind: 'denied' });
    expect(readTeamFailure(403, { message: 'Request denied' })).toEqual({ kind: 'denied' });
  });

  it('keeps only string field errors from a 400', () => {
    expect(
      readTeamFailure(400, { fieldErrors: { email: 'invalid', access: 'unknown_event', x: 1 } }),
    ).toEqual({ kind: 'invalid', fieldErrors: { email: 'invalid', access: 'unknown_event' } });
    expect(readTeamFailure(400, { message: 'Invalid request' })).toEqual({
      kind: 'invalid',
      fieldErrors: {},
    });
  });

  it('passes known 404 and 409 codes through and hides unknown ones', () => {
    expect(readTeamFailure(409, { code: 'last_global_admin' })).toEqual({
      kind: 'rule',
      code: 'last_global_admin',
    });
    expect(readTeamFailure(404, { code: 'member_not_found' })).toEqual({
      kind: 'rule',
      code: 'member_not_found',
    });
    expect(readTeamFailure(409, { code: 'something_else' })).toEqual({ kind: 'error' });
    expect(readTeamFailure(500, { code: 'email_in_use' })).toEqual({ kind: 'error' });
  });
});
