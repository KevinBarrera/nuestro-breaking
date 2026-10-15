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

  /** An invitation the token can still use, for an active user. */
  private usable(tokenDigest: string, now: Date) {
    return and(
      eq(adminInvitations.tokenDigest, tokenDigest),
      isNull(adminInvitations.usedAt),
      isNull(adminInvitations.cancelledAt),
      gt(adminInvitations.expiresAt, now),
      eq(users.active, true),
    );
  }

  /** Unlocked read of the usable invitation for a token digest, or `undefined`. */
  private async findUsable(tokenDigest: string, now: Date) {
    const [invitation] = await this.db
      .select({
        userId: adminInvitations.userId,
        displayName: users.displayName,
        email: users.email,
        expiresAt: adminInvitations.expiresAt,
      })
      .from(adminInvitations)
      .innerJoin(users, eq(users.id, adminInvitations.userId))
      .where(this.usable(tokenDigest, now));
    return invitation;
  }

  async check(token: string, now: Date = new Date()) {
    const invitation = await this.findUsable(digest(token), now);
    if (!invitation) throw invalidLink();
    return {
      displayName: invitation.displayName ?? '',
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Sets the password, consumes the link and revokes every existing session of the user. */
  async activate(token: string, password: string, now: Date = new Date()): Promise<void> {
    const tokenDigest = digest(token);
    // Cheap unlocked read first, so an unknown or unusable token never costs an Argon2id hash.
    const candidate = await this.findUsable(tokenDigest, now);
    if (!candidate) throw invalidLink();

    // Hash outside the transaction: Argon2id is deliberately slow and must not hold row locks.
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      // Lock order is the user row, then the invitation row, as in every team path
      // (`AdminTeamService` regenerate and cancel, `admin:bootstrap`), so they cannot deadlock.
      // Both rows are re-validated under the locks: the link may have been used, cancelled or
      // replaced, or the user deactivated, since the unlocked read.
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, candidate.userId), eq(users.active, true)))
        .for('update');
      if (!user) throw invalidLink();
      const [invitation] = await tx
        .select({ id: adminInvitations.id })
        .from(adminInvitations)
        .innerJoin(users, eq(users.id, adminInvitations.userId))
        .where(and(eq(adminInvitations.userId, user.id), this.usable(tokenDigest, now)))
        .for('update', { of: adminInvitations });
      if (!invitation) throw invalidLink();

      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      await tx
        .update(adminInvitations)
        .set({ usedAt: now })
        .where(eq(adminInvitations.id, invitation.id));
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      await tx.insert(adminTeamAudit).values({
        action: 'activated',
        actorUserId: user.id,
        targetUserId: user.id,
        details: { revokedSessions: revoked.length },
      });
    });
  }
}
