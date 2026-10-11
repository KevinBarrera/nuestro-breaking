import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { DatabaseService } from '@/database/database.service';
import { SessionAccessService } from './session-access.service';

/** A database double that only accepts the `denied` audit row. */
function auditOnlyDatabase() {
  const values = jest.fn().mockResolvedValue(undefined);
  const db = { insert: () => ({ values }) } as unknown as DatabaseService['db'];
  return db;
}

/** A cookie-less request: once the origin passes, the session check answers `401`. */
function requestFrom(origin: string) {
  return { headers: { origin }, header: () => undefined } as unknown as Request;
}

const response = {} as Response;

describe('SessionAccessService trusted origin', () => {
  const original = process.env.AUTH_TRUSTED_ORIGIN;

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_TRUSTED_ORIGIN;
    else process.env.AUTH_TRUSTED_ORIGIN = original;
  });

  it.each([
    ['padded', ' http://localhost:5173 '],
    ['blank', ''],
    ['whitespace-only', '   '],
  ])(
    'accepts the matching origin when AUTH_TRUSTED_ORIGIN is %s, like CORS and sign-in',
    async (_case, value) => {
      process.env.AUTH_TRUSTED_ORIGIN = value;
      const service = new SessionAccessService(auditOnlyDatabase());
      const request = requestFrom('http://localhost:5173');

      await expect(service.authorizeGlobalAdminMutation(request, response)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        service.authorizeEventAdminMutation(request, response, 'event-id'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('still denies an origin that does not match', async () => {
    process.env.AUTH_TRUSTED_ORIGIN = ' https://admin.example ';
    const service = new SessionAccessService(auditOnlyDatabase());

    await expect(
      service.authorizeGlobalAdminMutation(requestFrom('http://localhost:5173'), response),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
