import { registrationAuditActorColumns } from './registration-audit-actor';

describe('registration audit actor columns', () => {
  it('records an admin actor with its user and server-side session', () => {
    expect(
      registrationAuditActorColumns({ kind: 'admin', userId: 'user-1', sessionId: 'session-1' }),
    ).toEqual({ actorKind: 'admin', actorUserId: 'user-1', sessionId: 'session-1' });
  });

  it('records a public actor without a user or session', () => {
    expect(registrationAuditActorColumns({ kind: 'public' })).toEqual({
      actorKind: 'public',
      actorUserId: null,
      sessionId: null,
    });
  });

  it('records a system actor without a user or session', () => {
    expect(registrationAuditActorColumns({ kind: 'system' })).toEqual({
      actorKind: 'system',
      actorUserId: null,
      sessionId: null,
    });
  });

  it('keeps only the actor columns when an admin actor carries extra session fields', () => {
    const actor = { kind: 'admin' as const, userId: 'u', sessionId: 's', role: 'admin' };
    expect(registrationAuditActorColumns(actor)).toEqual({
      actorKind: 'admin',
      actorUserId: 'u',
      sessionId: 's',
    });
  });
});
