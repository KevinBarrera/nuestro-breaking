import { createHash, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { authAudit, authSessions, userRoles, users } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';

export const sessionCookieName = 'nb_admin_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
};
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class SessionAccessService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async denied(): Promise<never> {
    // Never store attempted emails, passwords, raw cookies, or CSRF tokens in audit rows.
    await this.db.insert(authAudit).values({ action: 'denied' });
    throw new UnauthorizedException('Unauthenticated');
  }

  private sessionToken(request: Request): string | undefined {
    const raw = request.headers.cookie?.split(';').map((part) => part.trim());
    const matches = raw?.filter((part) => part.startsWith(`${sessionCookieName}=`));
    if (matches?.length !== 1) return undefined;
    const token = matches[0].slice(sessionCookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  }

  async activeSession(request: Request, response: Response) {
    const token = this.sessionToken(request);
    if (!token) return this.denied();
    const [record] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenDigest, digest(token)),
          gt(authSessions.expiresAt, new Date()),
          isNull(authSessions.revokedAt),
          eq(users.active, true),
        ),
      );
    if (!record) {
      response.clearCookie(sessionCookieName, sessionCookieOptions);
      return this.denied();
    }
    const roles = await this.db
      .select({ role: userRoles.role, scopeType: userRoles.scopeType, scopeId: userRoles.scopeId })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, record.user.id),
          eq(userRoles.active, true),
          isNull(userRoles.revokedAt),
        ),
      );
    const adminRoles = roles.filter((row) => row.role === 'admin' || row.role === 'judge');
    if (!adminRoles.length) return this.denied();
    return { ...record, token, roles: adminRoles };
  }

  async adminEventScope(request: Request, response: Response): Promise<string[] | null> {
    const { roles } = await this.activeSession(request, response);
    if (roles.some((role) => role.role === 'admin' && role.scopeType === 'global')) {
      return null;
    }
    return [
      ...new Set(
        roles.flatMap((role) =>
          role.role === 'admin' && role.scopeType === 'event' && role.scopeId ? [role.scopeId] : [],
        ),
      ),
    ];
  }

  private async eventAdminSession(request: Request, response: Response, eventId: string) {
    const session = await this.activeSession(request, response);
    if (
      !session.roles.some(
        (role) =>
          role.role === 'admin' &&
          (role.scopeType === 'global' || (role.scopeType === 'event' && role.scopeId === eventId)),
      )
    ) {
      await this.denied();
    }
    return session;
  }

  async authorizeEventAdmin(request: Request, response: Response, eventId: string) {
    const session = await this.eventAdminSession(request, response, eventId);
    return { userId: session.user.id, sessionId: session.session.id };
  }

  async authorizeEventAdminMutation(request: Request, response: Response, eventId: string) {
    await this.assertTrustedOrigin(request);
    const session = await this.eventAdminSession(request, response, eventId);
    await this.assertCsrf(request, session.token);
    return { userId: session.user.id, sessionId: session.session.id };
  }

  /** Team management (#214 D6): only an active `admin` role in `global` scope; judges and event admins are denied. */
  private async globalAdminSession(request: Request, response: Response) {
    const session = await this.activeSession(request, response);
    if (!session.roles.some((role) => role.role === 'admin' && role.scopeType === 'global')) {
      await this.denied();
    }
    return session;
  }

  async authorizeGlobalAdmin(request: Request, response: Response) {
    const session = await this.globalAdminSession(request, response);
    return { userId: session.user.id, sessionId: session.session.id };
  }

  async authorizeGlobalAdminMutation(request: Request, response: Response) {
    await this.assertTrustedOrigin(request);
    const session = await this.globalAdminSession(request, response);
    await this.assertCsrf(request, session.token);
    return { userId: session.user.id, sessionId: session.session.id };
  }

  private async assertTrustedOrigin(request: Request): Promise<void> {
    const trusted = process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173';
    if (request.headers.origin !== trusted) {
      await this.db.insert(authAudit).values({ action: 'denied' });
      throw new ForbiddenException('Request denied');
    }
  }

  private async assertCsrf(request: Request, token: string): Promise<void> {
    const supplied = request.header('X-CSRF-Token') ?? '';
    const expected = digest(`nb-admin-csrf-v1:${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      await this.db.insert(authAudit).values({ action: 'denied' });
      throw new ForbiddenException('Request denied');
    }
  }

  async authorizeEvent(request: Request, response: Response, eventId: string): Promise<void> {
    const { roles } = await this.activeSession(request, response);
    if (
      !roles.some(
        (role) =>
          role.scopeType === 'global' || (role.scopeType === 'event' && role.scopeId === eventId),
      )
    ) {
      await this.denied();
    }
  }
}
