import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { adminInvitations, adminTeamAudit, events, userRoles, users } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { readTrustedOrigin } from '@/http';
import { activationLink, INVITATION_TTL_MS, newInvitationToken } from './admin-invitation';
import { buildTeamMembers, type InviteInput, type TeamMember } from './admin-team';

export type TeamActor = { userId: string; sessionId: string };
export type IssuedInvitation = { userId: string; activationUrl: string; expiresAt: string };

type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

const activeAdminRole = and(
  eq(userRoles.role, 'admin'),
  eq(userRoles.active, true),
  isNull(userRoles.revokedAt),
);
const openInvitation = and(isNull(adminInvitations.usedAt), isNull(adminInvitations.cancelledAt));

/** Team management for global administrators (#214 T3). Every change writes `admin_team_audit`. */
@Injectable()
export class AdminTeamService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

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
      return await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email));
        if (existing) throw emailInUse();

        if (input.access.kind === 'events') {
          const found = await tx
            .select({ id: events.id })
            .from(events)
            .where(inArray(events.id, input.access.eventIds));
          if (found.length !== input.access.eventIds.length)
            throw new BadRequestException({
              statusCode: 400,
              message: 'Invalid invitation',
              fieldErrors: { access: 'unknown_event' },
            });
        }

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
    return this.db.transaction(async (tx) => {
      const member = await this.lockMember(tx, userId);
      if (!member.active)
        throw new ConflictException({
          statusCode: 409,
          message: 'Member is deactivated',
          code: 'member_deactivated',
        });
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
    await this.db.transaction(async (tx) => {
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
   * Locks the user row so concurrent regenerate or cancel calls for one member serialize. Lock
   * order: every path that touches a member and their invitations (here, activation and
   * `admin:bootstrap`) locks the `users` row first and `admin_invitations` rows after it, so the
   * paths cannot deadlock each other.
   */
  private async lockMember(tx: Transaction, userId: string) {
    const [member] = await tx
      .select({ id: users.id, active: users.active })
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

function emailInUse() {
  return new ConflictException({
    statusCode: 409,
    message: 'Email already registered',
    code: 'email_in_use',
  });
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
