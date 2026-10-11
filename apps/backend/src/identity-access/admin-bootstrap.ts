import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  adminInvitations,
  adminTeamAudit,
  authSessions,
  userRoles,
  users,
} from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { readTrustedOrigin } from '@/http';
import { hasControlCharacters } from './password-policy';
import { digest } from './session-access.service';

export type BootstrapDatabase = DatabaseService['db'];

export type AdminBootstrapInput = {
  email: string;
  displayName: string;
  /** Origin of the admin app, used to build the activation link. */
  origin: string;
};

export type AdminBootstrapOutcome =
  | { kind: 'issued'; reissued: boolean; link: string; expiresAt: Date }
  | { kind: 'refused'; reason: 'active_admin_exists' }
  | { kind: 'refused'; reason: 'pending_admin_exists'; maskedEmail: string };

/** 0 = link issued, 1 = error (bad input, database failure), 2 = refused because already bootstrapped. */
export const BOOTSTRAP_EXIT_CODES = { issued: 0, error: 1, refused: 2 } as const;

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

// Serializes concurrent bootstrap runs against the same database. Any constant works as long as
// no other code uses it for a different purpose.
const BOOTSTRAP_LOCK_KEY = 214_000_001;

/** Validate before opening a database connection. Never include input values in errors. */
export function parseAdminBootstrapInput(
  env: Record<string, string | undefined>,
): AdminBootstrapInput {
  const rawEmail = env.ADMIN_BOOTSTRAP_EMAIL ?? '';
  const rawName = env.ADMIN_BOOTSTRAP_NAME ?? '';
  const email = rawEmail.trim().toLowerCase();
  const displayName = rawName.trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    hasControlCharacters(rawEmail)
  ) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL must be a valid email (up to 254 characters).');
  }
  if (!displayName || displayName.length > 200 || hasControlCharacters(rawName)) {
    throw new Error('ADMIN_BOOTSTRAP_NAME must be a non-empty name (up to 200 characters).');
  }
  // Required explicitly: the reader's local fallback would print a link no hosted user can open.
  const origin = env.AUTH_TRUSTED_ORIGIN?.trim() ? readTrustedOrigin(env) : '';
  if (!isHttpOrigin(origin)) {
    throw new Error(
      'AUTH_TRUSTED_ORIGIN must be the absolute http(s) origin of the admin app, like https://admin.example.com.',
    );
  }
  return { email, displayName, origin };
}

/** The token travels in the fragment, which browsers never send to servers or proxies. */
export function activationLink(origin: string, token: string): string {
  return `${origin}/activar-cuenta#${token}`;
}

/** Enough to recognize an address without disclosing it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Creates the first global administrator of an environment with a one-time activation link, or
 * reissues the link of a pending (never activated) one with the same email. Refuses when an
 * activated global administrator exists, or when a pending one exists with a different email.
 */
export async function bootstrapAdmin(
  db: BootstrapDatabase,
  input: AdminBootstrapInput,
  now: Date = new Date(),
): Promise<AdminBootstrapOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw(String(BOOTSTRAP_LOCK_KEY))})`);

    const globalAdmins = await tx
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(users.active, true),
          eq(userRoles.role, 'admin'),
          eq(userRoles.scopeType, 'global'),
          isNull(userRoles.scopeId),
          eq(userRoles.active, true),
          isNull(userRoles.revokedAt),
        ),
      );
    if (globalAdmins.some((admin) => admin.passwordHash !== null)) {
      return { kind: 'refused', reason: 'active_admin_exists' };
    }
    const pending = globalAdmins.find((admin) => admin.email === input.email);
    if (!pending && globalAdmins.length > 0) {
      return {
        kind: 'refused',
        reason: 'pending_admin_exists',
        maskedEmail: maskEmail(globalAdmins[0].email),
      };
    }

    let userId: string;
    if (pending) {
      userId = pending.id;
      await tx.update(users).set({ displayName: input.displayName }).where(eq(users.id, userId));
    } else {
      // Reusing an existing row clears any password: the person proves control through the link.
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          displayName: input.displayName,
          active: true,
          passwordHash: null,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { displayName: input.displayName, active: true, passwordHash: null },
        })
        .returning({ id: users.id });
      userId = user.id;
      await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      // A deactivated user may still hold an active global admin role; keep it instead of
      // adding a duplicate.
      const [existingRole] = await tx
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.role, 'admin'),
            eq(userRoles.scopeType, 'global'),
            isNull(userRoles.scopeId),
            eq(userRoles.active, true),
            isNull(userRoles.revokedAt),
          ),
        )
        .limit(1);
      if (!existingRole) {
        await tx.insert(userRoles).values({ userId, role: 'admin', scopeType: 'global' });
      }
    }

    await tx
      .update(adminInvitations)
      .set({ cancelledAt: now })
      .where(
        and(
          eq(adminInvitations.userId, userId),
          isNull(adminInvitations.usedAt),
          isNull(adminInvitations.cancelledAt),
        ),
      );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    // created_by_user_id is NOT NULL and nobody else exists yet, so the invitee is the creator.
    await tx.insert(adminInvitations).values({
      userId,
      tokenDigest: digest(token),
      expiresAt,
      createdByUserId: userId,
    });
    await tx.insert(adminTeamAudit).values({
      action: 'bootstrapped',
      targetUserId: userId,
      details: pending ? { scope: 'global', reissued: true } : { scope: 'global' },
    });

    return {
      kind: 'issued',
      reissued: Boolean(pending),
      link: activationLink(input.origin, token),
      expiresAt,
    };
  });
}

function isHttpOrigin(value: string): boolean {
  if (value.includes('*')) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}
