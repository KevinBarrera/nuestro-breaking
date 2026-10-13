import {
  buildTeamMembers,
  parseActivationToken,
  parseAccessChangeInput,
  parseInviteInput,
  parseOptionalReasonInput,
  parseRequiredReasonInput,
  type TeamInvitationRow,
  type TeamRoleRow,
} from './admin-team';

const eventA = '6f1c2b8e-4d4b-4f7a-9a51-0f7d3c1a2b01';
const eventB = '6f1c2b8e-4d4b-4f7a-9a51-0f7d3c1a2b02';

describe('parseInviteInput', () => {
  it('normalizes a global invitation', () => {
    expect(
      parseInviteInput({
        displayName: '  Ana López ',
        email: ' Ana@Example.COM ',
        access: { kind: 'global' },
      }),
    ).toEqual({
      ok: true,
      value: { displayName: 'Ana López', email: 'ana@example.com', access: { kind: 'global' } },
    });
  });

  it('accepts an event-scoped invitation with unique event ids', () => {
    expect(
      parseInviteInput({
        displayName: 'Ana',
        email: 'ana@example.com',
        access: { kind: 'events', eventIds: [eventA, eventB] },
      }),
    ).toEqual({
      ok: true,
      value: {
        displayName: 'Ana',
        email: 'ana@example.com',
        access: { kind: 'events', eventIds: [eventA, eventB] },
      },
    });
  });

  it.each([
    ['not an object', null],
    ['an array', []],
  ])('rejects a body that is %s', (_label, body) => {
    expect(parseInviteInput(body)).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
  });

  it('reports every invalid field without echoing values', () => {
    expect(
      parseInviteInput({ displayName: '  ', email: 'not-an-email', access: { kind: 'owner' } }),
    ).toEqual({
      ok: false,
      fieldErrors: { displayName: 'invalid', email: 'invalid', access: 'invalid' },
    });
  });

  it.each([
    ['empty', []],
    ['duplicated', [eventA, eventA]],
    ['not uuids', ['event-1']],
    ['not an array', eventA],
  ])('rejects event ids that are %s', (_label, eventIds) => {
    expect(
      parseInviteInput({
        displayName: 'Ana',
        email: 'ana@example.com',
        access: { kind: 'events', eventIds },
      }),
    ).toEqual({ ok: false, fieldErrors: { access: 'invalid' } });
  });

  it('rejects control characters and overlong values', () => {
    expect(
      parseInviteInput({
        displayName: 'a'.repeat(201),
        email: 'ana@example.com\n',
        access: { kind: 'global' },
      }),
    ).toEqual({ ok: false, fieldErrors: { displayName: 'invalid', email: 'invalid' } });
  });
});

describe('parseAccessChangeInput', () => {
  it('accepts a new access with an optional trimmed reason', () => {
    expect(parseAccessChangeInput({ access: { kind: 'global' } })).toEqual({
      ok: true,
      value: { access: { kind: 'global' }, reason: null },
    });
    expect(
      parseAccessChangeInput({
        access: { kind: 'events', eventIds: [eventA.toUpperCase()] },
        reason: '  Moved to the other event ',
      }),
    ).toEqual({
      ok: true,
      value: { access: { kind: 'events', eventIds: [eventA] }, reason: 'Moved to the other event' },
    });
  });

  it('reports the invalid fields', () => {
    expect(parseAccessChangeInput({ access: { kind: 'events', eventIds: [] } })).toEqual({
      ok: false,
      fieldErrors: { access: 'invalid' },
    });
    expect(parseAccessChangeInput({ access: { kind: 'global' }, reason: 'a\u0007b' })).toEqual({
      ok: false,
      fieldErrors: { reason: 'invalid' },
    });
    expect(parseAccessChangeInput(null)).toEqual({ ok: false, fieldErrors: { body: 'invalid' } });
  });
});

describe('parseRequiredReasonInput', () => {
  it('requires a trimmed reason of 1 to 500 characters', () => {
    expect(parseRequiredReasonInput({ reason: '  Left the team ' })).toEqual({
      ok: true,
      value: 'Left the team',
    });
    expect(parseRequiredReasonInput({ reason: 'a'.repeat(500) })).toMatchObject({ ok: true });
    for (const reason of [undefined, '', '   ', 'a'.repeat(501), 'line\nbreak', 42])
      expect(parseRequiredReasonInput({ reason })).toEqual({
        ok: false,
        fieldErrors: { reason: 'invalid' },
      });
    expect(parseRequiredReasonInput(undefined)).toEqual({
      ok: false,
      fieldErrors: { reason: 'invalid' },
    });
  });
});

describe('parseOptionalReasonInput', () => {
  it('treats a missing or blank reason as none', () => {
    expect(parseOptionalReasonInput({})).toEqual({ ok: true, value: null });
    expect(parseOptionalReasonInput(undefined)).toEqual({ ok: true, value: null });
    expect(parseOptionalReasonInput({ reason: '  ' })).toEqual({ ok: true, value: null });
    expect(parseOptionalReasonInput({ reason: ' Back ' })).toEqual({ ok: true, value: 'Back' });
    expect(parseOptionalReasonInput({ reason: 'tab\there' })).toEqual({
      ok: false,
      fieldErrors: { reason: 'invalid' },
    });
  });
});

describe('parseActivationToken', () => {
  it('accepts 64 lowercase hex characters', () => {
    expect(parseActivationToken('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it.each([undefined, 42, '', 'A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`])(
    'rejects %p',
    (value) => {
      expect(parseActivationToken(value)).toBeNull();
    },
  );
});

describe('buildTeamMembers', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const base = { displayName: 'Ana', email: 'ana@example.com', active: true, hasPassword: true };

  it('maps status, access and open invitations', () => {
    const roles: TeamRoleRow[] = [
      {
        userId: 'global',
        ...base,
        displayName: 'Beto',
        scopeType: 'global',
        eventId: null,
        eventName: null,
      },
      {
        userId: 'scoped',
        ...base,
        displayName: 'Ana',
        scopeType: 'event',
        eventId: eventB,
        eventName: 'Zeta',
      },
      {
        userId: 'scoped',
        ...base,
        displayName: 'Ana',
        scopeType: 'event',
        eventId: eventA,
        eventName: 'Alfa',
      },
      {
        userId: 'pending',
        ...base,
        displayName: 'Carla',
        hasPassword: false,
        scopeType: 'global',
        eventId: null,
        eventName: null,
      },
      {
        userId: 'off',
        ...base,
        displayName: 'Dora',
        active: false,
        scopeType: 'global',
        eventId: null,
        eventName: null,
      },
    ];
    const invitations: TeamInvitationRow[] = [
      { userId: 'pending', expiresAt: new Date('2026-10-11T11:59:59Z') },
    ];
    expect(buildTeamMembers(roles, invitations, now)).toEqual([
      {
        id: 'scoped',
        displayName: 'Ana',
        email: 'ana@example.com',
        status: 'active',
        access: {
          kind: 'events',
          events: [
            { id: eventA, name: 'Alfa' },
            { id: eventB, name: 'Zeta' },
          ],
        },
        invitation: null,
      },
      {
        id: 'global',
        displayName: 'Beto',
        email: 'ana@example.com',
        status: 'active',
        access: { kind: 'global' },
        invitation: null,
      },
      {
        id: 'pending',
        displayName: 'Carla',
        email: 'ana@example.com',
        status: 'pending',
        access: { kind: 'global' },
        invitation: { expiresAt: '2026-10-11T11:59:59.000Z', expired: true },
      },
      {
        id: 'off',
        displayName: 'Dora',
        email: 'ana@example.com',
        status: 'deactivated',
        access: { kind: 'global' },
        invitation: null,
      },
    ]);
  });

  it('prefers global access when a user also holds event roles', () => {
    const roles: TeamRoleRow[] = [
      { userId: 'u', ...base, scopeType: 'event', eventId: eventA, eventName: 'Alfa' },
      { userId: 'u', ...base, scopeType: 'global', eventId: null, eventName: null },
    ];
    expect(buildTeamMembers(roles, [], now)[0].access).toEqual({ kind: 'global' });
  });

  it('keeps members without an active admin role as no access (#213 D9)', () => {
    const none = { scopeType: null, eventId: null, eventName: null };
    const roles: TeamRoleRow[] = [
      { userId: 'off', ...base, displayName: 'Dora', active: false, ...none },
      { userId: 'stranded', ...base, displayName: 'Ana', ...none },
      { userId: 'never', ...base, displayName: 'Beto', hasPassword: false, ...none },
      // An event role whose event no longer exists grants nothing.
      {
        userId: 'gone',
        ...base,
        displayName: 'Carla',
        scopeType: 'event',
        eventId: null,
        eventName: null,
      },
      {
        userId: 'pending',
        ...base,
        displayName: 'Zoe',
        hasPassword: false,
        scopeType: 'global',
        eventId: null,
        eventName: null,
      },
    ];
    const invitations: TeamInvitationRow[] = [
      { userId: 'never', expiresAt: new Date('2026-10-12T12:00:00Z') },
    ];
    expect(
      buildTeamMembers(roles, invitations, now).map(({ id, status, access, invitation }) => ({
        id,
        status,
        access,
        invitation,
      })),
    ).toEqual([
      { id: 'pending', status: 'pending', access: { kind: 'global' }, invitation: null },
      { id: 'stranded', status: 'no_access', access: { kind: 'none' }, invitation: null },
      {
        id: 'never',
        status: 'no_access',
        access: { kind: 'none' },
        invitation: { expiresAt: '2026-10-12T12:00:00.000Z', expired: false },
      },
      { id: 'gone', status: 'no_access', access: { kind: 'none' }, invitation: null },
      { id: 'off', status: 'deactivated', access: { kind: 'none' }, invitation: null },
    ]);
  });
});
