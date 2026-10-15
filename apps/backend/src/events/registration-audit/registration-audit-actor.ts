// Who performed an audited registration operation (D4 of #174). An admin is identified by its user
// and server-side session record; a public buyer and the system (for example a verified online
// payment) carry no identity, so no names, emails or provider data reach the audit row.
export type RegistrationAuditActor =
  { kind: 'admin'; userId: string; sessionId: string } | { kind: 'public' } | { kind: 'system' };

export type AdminRegistrationAuditActor = Extract<RegistrationAuditActor, { kind: 'admin' }>;

export type RegistrationAuditActorKind = RegistrationAuditActor['kind'];

export type RegistrationAuditActorColumns = {
  actorKind: RegistrationAuditActorKind;
  actorUserId: string | null;
  sessionId: string | null;
};

// Maps an actor to the three audit columns; the database checks enforce the same pairing.
export function registrationAuditActorColumns(
  actor: RegistrationAuditActor,
): RegistrationAuditActorColumns {
  if (actor.kind === 'admin')
    return { actorKind: 'admin', actorUserId: actor.userId, sessionId: actor.sessionId };
  return { actorKind: actor.kind, actorUserId: null, sessionId: null };
}
