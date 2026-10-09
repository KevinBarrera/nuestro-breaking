import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { verify } from 'argon2';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { authAudit, authSessions, userRoles, users } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { readTrustedOrigin } from '@/http';
import {
  digest,
  sessionCookieName as cookieName,
  sessionCookieOptions as cookieOptions,
  SessionAccessService,
} from './session-access.service';

const lifetimeMs = 8 * 60 * 60 * 1000; // Fixed, non-renewing 8-hour session; deployment policy remains a follow-up.
const csrfFor = (token: string) => digest(`nb-admin-csrf-v1:${token}`);
const dummyPasswordHash =
  '$argon2id$v=19$m=65536,p=4,t=3$LmZxB8GFh2DD5ukJv8CQug$GopHzamrH80u906LdN2evcHzThwIsFo0zF5DZYg4PHc';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db'],
    private readonly sessions: SessionAccessService,
  ) {}

  private async checkOrigin(request: Request): Promise<void> {
    // A single exact browser Origin is required. JSON-only sign-in + SameSite=Strict
    // cookie makes Origin the pre-session CSRF defense; sign-out also uses a session-bound token.
    const trusted = readTrustedOrigin(process.env);
    if (request.headers.origin !== trusted) {
      await this.db.insert(authAudit).values({ action: 'denied' });
      throw new ForbiddenException('Request denied');
    }
  }

  @Post('admin/sign-in')
  async signIn(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    await this.checkOrigin(request);
    if (
      !request.is('application/json') ||
      !body ||
      typeof body !== 'object' ||
      !('email' in body) ||
      !('password' in body) ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      !body.email ||
      !body.password
    )
      return this.sessions.denied();

    const [user] = await this.db.select().from(users).where(eq(users.email, body.email));
    // Only explicitly Argon2id PHC hashes can be used as password verifiers.
    // Unknown or unconfigured identities still run one Argon2id verification so
    // safe denials do not have an obvious account-enumeration fast path.
    const verifier = user?.passwordHash?.startsWith('$argon2id$')
      ? user.passwordHash
      : dummyPasswordHash;
    const valid = await verify(verifier, body.password).catch(() => false);
    const roles = user
      ? await this.db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(
            and(
              eq(userRoles.userId, user.id),
              eq(userRoles.active, true),
              isNull(userRoles.revokedAt),
            ),
          )
      : [];
    const adminRoles = roles
      .map((row) => row.role)
      .filter((role) => role === 'admin' || role === 'judge');
    if (!valid || !user.active || !adminRoles.length) return this.sessions.denied();

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + lifetimeMs);
    await this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(authSessions)
        .values({ userId: user.id, tokenDigest: digest(token), expiresAt })
        .returning({ id: authSessions.id });
      await tx
        .insert(authAudit)
        .values({ action: 'session_created', userId: user.id, sessionId: session.id });
    });
    response.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetimeMs });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, roles: adminRoles },
      csrfToken: csrfFor(token),
    };
  }

  @Get('session')
  async current(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { session, user, token, roles } = await this.sessions.activeSession(request, response);
    // A CSRF value is delivered in a response header to enable sign-out after reload,
    // never as a credential or token field in the current-session identity payload.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-CSRF-Token', csrfFor(token));
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: roles.map((row) => row.role),
      },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.checkOrigin(request);
    const { session, token, user } = await this.sessions.activeSession(request, response);
    const supplied = request.header('X-CSRF-Token') ?? '';
    const expected = csrfFor(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      await this.db.insert(authAudit).values({ action: 'denied' });
      throw new ForbiddenException('Request denied');
    }
    await this.db.transaction(async (tx) => {
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      if (!revoked.length) return;
      await tx
        .insert(authAudit)
        .values({ action: 'session_revoked', userId: user.id, sessionId: session.id });
    });
    response.clearCookie(cookieName, cookieOptions);
    return { signedOut: true };
  }
}
