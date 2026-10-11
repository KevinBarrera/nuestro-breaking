import { GoneException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { adminInvitations, adminTeamAudit, authSessions, users } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { hashPassword } from './password-policy';
import { digest } from './session-access.service';

/**
 * The single answer for any link that cannot be used: unknown, malformed, expired, used,
 * cancelled, replaced, or for a deactivated user. It never says which (#214 D8).
 */
export function invalidLink(): GoneException {
  return new GoneException({
    statusCode: 410,
    message: 'Invalid or expired link',
    code: 'invalid_link',
  });
}

/** Public account activation from an invitation link (#214 T4). It never signs the user in. */
@Injectable()
export class AccountActivationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  private usable(token: string, now: Date) {
    return and(
      eq(adminInvitations.tokenDigest, digest(token)),
      isNull(adminInvitations.usedAt),
      isNull(adminInvitations.cancelledAt),
      gt(adminInvitations.expiresAt, now),
      eq(users.active, true),
    );
  }

  async check(token: string, now: Date = new Date()) {
    const [invitation] = await this.db
      .select({
        displayName: users.displayName,
        email: users.email,
        expiresAt: adminInvitations.expiresAt,
      })
      .from(adminInvitations)
      .innerJoin(users, eq(users.id, adminInvitations.userId))
      .where(this.usable(token, now));
    if (!invitation) throw invalidLink();
    return {
      displayName: invitation.displayName ?? '',
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Sets the password, consumes the link and revokes every existing session of the user. */
  async activate(token: string, password: string, now: Date = new Date()): Promise<void> {
    // Hash before locking: Argon2id is deliberately slow.
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      const [invitation] = await tx
        .select({ id: adminInvitations.id, userId: adminInvitations.userId })
        .from(adminInvitations)
        .innerJoin(users, eq(users.id, adminInvitations.userId))
        .where(this.usable(token, now))
        .for('update');
      if (!invitation) throw invalidLink();

      await tx.update(users).set({ passwordHash }).where(eq(users.id, invitation.userId));
      await tx
        .update(adminInvitations)
        .set({ usedAt: now })
        .where(eq(adminInvitations.id, invitation.id));
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, invitation.userId), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      await tx.insert(adminTeamAudit).values({
        action: 'activated',
        actorUserId: invitation.userId,
        targetUserId: invitation.userId,
        details: { revokedSessions: revoked.length },
      });
    });
  }
}
