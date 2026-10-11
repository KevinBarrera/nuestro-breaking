import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, exists, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import {
  adminInvitations,
  adminTeamAudit,
  authSessions,
  events,
  userRoles,
  users,
} from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { readTrustedOrigin } from '@/http';
import { SessionAccessService } from './session-access.service';
import { activationLink, INVITATION_TTL_MS, newInvitationToken } from './admin-invitation';
import {
  buildTeamMembers,
  type AccessChangeInput,
  type InviteInput,
  type TeamAccessInput,
  type TeamMember,
} from './admin-team';

export type TeamActor = { userId: string; sessionId: string };
export type IssuedInvitation = { userId: string; activationUrl: string; expiresAt: string };
export type MemberStatusResult = { status: 'active' | 'pending' | 'deactivated' };

type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

const activeAdminRole = and(
  eq(userRoles.role, 'admin'),
  eq(userRoles.active, true),
  isNull(userRoles.revokedAt),
);
const openInvitation = and(isNull(adminInvitations.usedAt), isNull(adminInvitations.cancelledAt));

/**
 * Advisory lock that serializes every team change. Two changes cannot each see "another admin
 * remains" and together leave none, and a caller whose own access is removed by a change that
 * commits first is re-checked after the lock and refused. Any constant works as long as no other
 * code uses it for a different purpose.
 */
export const ADMIN_TEAM_LOCK_KEY = 214_000_002;

/** Thrown inside a team transaction when the caller is no longer an active global admin. */
class StaleActorAuthority extends Error {}

/** True for `users` rows that hold an active `admin` role in `global` scope. */
function hasActiveGlobalAdminRole(tx: Transaction) {
  return exists(
    tx
      .select({ one: sql`1` })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, users.id), eq(userRoles.scopeType, 'global'), activeAdminRole),
      ),
  );
}

type ScopedRole = { scopeType: string; scopeId: string | null };
const roleKey = (role: ScopedRole) => `${role.scopeType}:${role.scopeId ?? ''}`;

/** Team management for global administrators (#214 T3). Every change writes `admin_team_audit`. */
@Injectable()
export class AdminTeamService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db'],
    private readonly sessions: SessionAccessService,
  ) {}

  async list(now: Date = new Date()): Promise<TeamMember[]> {
    const roles = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        active: users.active,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
        scopeType: userRoles.scopeType,
        eventId: events.id,
        eventName: events.name,
      })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .leftJoin(events, and(eq(userRoles.scopeType, 'event'), eq(events.id, userRoles.scopeId)))
      .where(activeAdminRole);
    const invitations = await this.db
      .select({ userId: adminInvitations.userId, expiresAt: adminInvitations.expiresAt })
      .from(adminInvitations)
      .where(openInvitation);
    return buildTeamMembers(roles, invitations, now);
  }

  async invite(
    input: InviteInput,
    actor: TeamActor,
    now: Date = new Date(),
  ): Promise<IssuedInvitation> {
    try {
      return await this.asActor(actor, async (tx) => {
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email));
        if (existing) throw emailInUse();

        await this.assertEventsExist(tx, input.access, 'Invalid invitation');

        const [user] = await tx
          .insert(users)
          .values({ email: input.email, displayName: input.displayName, passwordHash: null })
          .returning({ id: users.id });
        await tx.insert(userRoles).values(
          input.access.kind === 'global'
            ? [{ userId: user.id, role: 'admin', scopeType: 'global' }]
            : input.access.eventIds.map((eventId) => ({
                userId: user.id,
                role: 'admin',
                scopeType: 'event',
                scopeId: eventId,
              })),
        );
        const issued = await this.issue(tx, user.id, actor, now);
        await tx.insert(adminTeamAudit).values({
          action: 'invited',
          actorUserId: actor.userId,
          actorSessionId: actor.sessionId,
          targetUserId: user.id,
          details: { access: input.access },
        });
        return issued;
      });
    } catch (error) {
      // A concurrent invitation for the same email loses the race on the unique email.
      if (isUniqueViolation(error, 'users_email_unique')) throw emailInUse();
      throw error;
    }
  }

  /**
   * Cancels the open invitation, if any, and issues a new link. Allowed for pending members and
   * for active ones, as the way to recover a lost password (#214 D2); refused for deactivated ones.
   */
  async regenerate(
    userId: string,
    actor: TeamActor,
    now: Date = new Date(),
  ): Promise<IssuedInvitation> {
    return this.asActor(actor, async (tx) => {
      const member = await this.lockMember(tx, userId);
      if (!member.active) throw memberDeactivated();
      const cancelled = await this.cancelOpen(tx, userId, now);
      const issued = await this.issue(tx, userId, actor, now);
      await tx.insert(adminTeamAudit).values({
        action: 'invitation_regenerated',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        targetUserId: userId,
        details: { replacedOpenInvitation: cancelled > 0 },
      });
      return issued;
    });
  }

  async cancel(userId: string, actor: TeamActor, now: Date = new Date()): Promise<void> {
    await this.asActor(actor, async (tx) => {
      await this.lockMember(tx, userId);
      if ((await this.cancelOpen(tx, userId, now)) === 0)
        throw new NotFoundException({
          statusCode: 404,
          message: 'No open invitation',
          code: 'no_open_invitation',
        });
      await tx.insert(adminTeamAudit).values({
        action: 'invitation_cancelled',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        targetUserId: userId,
      });
    });
  }

  /**
   * Replaces the member's admin access: revokes the roles no longer granted and adds the new ones.
   * Their sessions stay valid; every request reads roles live, so the next one sees the new scope.
   */
  async changeAccess(
    userId: string,
    input: AccessChangeInput,
    actor: TeamActor,
    now: Date = new Date(),
  ): Promise<{ changed: boolean }> {
    return this.asActor(actor, async (tx) => {
      const member = await this.lockMember(tx, userId);
      // The locked row's id, not the route parameter, so no spelling of the caller's id slips by.
      if (member.id === actor.userId)
        throw conflict('self_change', 'You cannot change your own access');
      await this.assertEventsExist(tx, input.access, 'Invalid access change');

      const current = await tx
        .select({ id: userRoles.id, scopeType: userRoles.scopeType, scopeId: userRoles.scopeId })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), activeAdminRole));
      const wanted: ScopedRole[] =
        input.access.kind === 'global'
          ? [{ scopeType: 'global', scopeId: null }]
          : input.access.eventIds.map((eventId) => ({ scopeType: 'event', scopeId: eventId }));
      const wantedKeys = new Set(wanted.map(roleKey));
      const currentKeys = new Set(current.map(roleKey));
      const revoke = current.filter((role) => !wantedKeys.has(roleKey(role)));
      const grant = wanted.filter((role) => !currentKeys.has(roleKey(role)));
      if (!revoke.length && !grant.length) return { changed: false };

      if (revoke.some((role) => role.scopeType === 'global'))
        await this.assertAnotherGlobalAdmin(tx, userId);
      if (revoke.length)
        await tx
          .update(userRoles)
          .set({ active: false, revokedAt: now })
          .where(
            inArray(
              userRoles.id,
              revoke.map((role) => role.id),
            ),
          );
      if (grant.length)
        await tx
          .insert(userRoles)
          .values(grant.map((role) => ({ userId, role: 'admin', ...role, approvedAt: now })));
      await tx.insert(adminTeamAudit).values({
        action: 'scope_changed',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        targetUserId: userId,
        reason: input.reason,
        details: { from: accessOf(current), to: accessOf(wanted) },
      });
      return { changed: true };
    });
  }

  /**
   * Turns the member's access off at once: the account is marked inactive, every session is
   * revoked and any open link is cancelled. Their admin roles stay, so reactivation restores the
   * same access.
   */
  async deactivate(
    userId: string,
    reason: string,
    actor: TeamActor,
    now: Date = new Date(),
  ): Promise<MemberStatusResult> {
    return this.asActor(actor, async (tx) => {
      const member = await this.lockMember(tx, userId);
      if (member.id === actor.userId)
        throw conflict('self_deactivation', 'You cannot deactivate yourself');
      if (!member.active) throw memberDeactivated();
      if (member.globalAdmin) await this.assertAnotherGlobalAdmin(tx, userId);

      await tx.update(users).set({ active: false }).where(eq(users.id, userId));
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      const cancelled = await this.cancelOpen(tx, userId, now);
      await tx.insert(adminTeamAudit).values({
        action: 'deactivated',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        targetUserId: userId,
        reason,
        details: { revokedSessions: revoked.length, cancelledInvitation: cancelled > 0 },
      });
      return { status: 'deactivated' };
    });
  }

  /**
   * Turns a deactivated member's access back on with the access they had. An activated member
   * signs in with their existing password; one who never activated is pending again and needs a
   * new link (deactivation cancelled the old one).
   */
  async reactivate(
    userId: string,
    reason: string | null,
    actor: TeamActor,
  ): Promise<MemberStatusResult> {
    return this.asActor(actor, async (tx) => {
      const member = await this.lockMember(tx, userId);
      if (member.active) throw conflict('member_active', 'Member is already active');
      await tx.update(users).set({ active: true }).where(eq(users.id, userId));
      const status = member.hasPassword ? 'active' : 'pending';
      await tx.insert(adminTeamAudit).values({
        action: 'reactivated',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        targetUserId: userId,
        reason,
        details: { status },
      });
      return { status };
    });
  }

  /**
   * Runs one team change as `actor`: takes the team lock, then re-checks that the caller is still
   * an active user with an active global admin role, since authorization ran before the lock and a
   * change that committed meanwhile may have removed it. A stale caller gets the same `401` as any
   * other denial, and nothing changes.
   */
  private async asActor<T>(actor: TeamActor, work: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${sql.raw(String(ADMIN_TEAM_LOCK_KEY))})`,
        );
        const [current] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.id, actor.userId), eq(users.active, true), hasActiveGlobalAdminRole(tx)),
          );
        if (!current) throw new StaleActorAuthority();
        return work(tx);
      });
    } catch (error) {
      // Audited after the rollback, so the denial is recorded even though the change is not.
      if (error instanceof StaleActorAuthority) return this.sessions.denied();
      throw error;
    }
  }

  /**
   * Locks the user row so concurrent changes for one member serialize. Lock order: team changes
   * take the team advisory lock first; every path that touches a member and their invitations
   * (here, activation and `admin:bootstrap`) then locks the `users` row and `admin_invitations`
   * rows after it, so the paths cannot deadlock each other.
   */
  private async lockMember(tx: Transaction, userId: string) {
    const [member] = await tx
      .select({
        id: users.id,
        active: users.active,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
        globalAdmin: hasActiveGlobalAdminRole(tx).mapWith(Boolean),
      })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          exists(
            tx
              .select({ one: sql`1` })
              .from(userRoles)
              .where(and(eq(userRoles.userId, users.id), activeAdminRole)),
          ),
        ),
      )
      .for('update');
    if (!member)
      throw new NotFoundException({
        statusCode: 404,
        message: 'Member not found',
        code: 'member_not_found',
      });
    return member;
  }

  /**
   * Refuses a change that would leave no activated global admin besides `userId`. Only active
   * users with a password count: a pending global admin cannot sign in to manage the team.
   */
  private async assertAnotherGlobalAdmin(tx: Transaction, userId: string): Promise<void> {
    const [other] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          ne(users.id, userId),
          eq(users.active, true),
          isNotNull(users.passwordHash),
          hasActiveGlobalAdminRole(tx),
        ),
      )
      .limit(1);
    if (!other) throw conflict('last_global_admin', 'At least one active global admin must remain');
  }

  private async assertEventsExist(
    tx: Transaction,
    access: TeamAccessInput,
    message: string,
  ): Promise<void> {
    if (access.kind !== 'events') return;
    const found = await tx
      .select({ id: events.id })
      .from(events)
      .where(inArray(events.id, access.eventIds));
    if (found.length !== access.eventIds.length)
      throw new BadRequestException({
        statusCode: 400,
        message,
        fieldErrors: { access: 'unknown_event' },
      });
  }

  private async cancelOpen(tx: Transaction, userId: string, now: Date): Promise<number> {
    const rows = await tx
      .update(adminInvitations)
      .set({ cancelledAt: now })
      .where(and(eq(adminInvitations.userId, userId), openInvitation))
      .returning({ id: adminInvitations.id });
    return rows.length;
  }

  private async issue(
    tx: Transaction,
    userId: string,
    actor: TeamActor,
    now: Date,
  ): Promise<IssuedInvitation> {
    const { token, tokenDigest } = newInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    await tx
      .insert(adminInvitations)
      .values({ userId, tokenDigest, expiresAt, createdByUserId: actor.userId });
    return {
      userId,
      activationUrl: activationLink(readTrustedOrigin(process.env), token),
      expiresAt: expiresAt.toISOString(),
    };
  }
}

function conflict(code: string, message: string) {
  return new ConflictException({ statusCode: 409, message, code });
}

function memberDeactivated() {
  return conflict('member_deactivated', 'Member is deactivated');
}

/** The audited shape of a set of admin roles: global wins, event ids are sorted. */
function accessOf(roles: ScopedRole[]): TeamAccessInput {
  if (roles.some((role) => role.scopeType === 'global')) return { kind: 'global' };
  const eventIds = roles.flatMap((role) =>
    role.scopeType === 'event' && role.scopeId ? [role.scopeId] : [],
  );
  return { kind: 'events', eventIds: [...new Set(eventIds)].sort() };
}

function emailInUse() {
  return conflict('email_in_use', 'Email already registered');
}

// Drizzle wraps driver errors; the PostgreSQL error may sit on the error itself or on `cause`.
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current && typeof current === 'object';) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === constraint) return true;
    current = candidate.cause;
  }
  return false;
}
