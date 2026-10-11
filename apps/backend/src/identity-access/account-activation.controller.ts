import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { authAudit } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import { readTrustedOrigin } from '@/http';
import { invalidLink, AccountActivationService } from './account-activation.service';
import { parseActivationToken } from './admin-team';
import { failedPasswordRules } from './password-policy';

// Pre-session routes: like sign-in, the exact trusted Origin is the CSRF defense. The token comes
// in the JSON body (never the query string) so it stays out of access logs. Tokens and passwords
// are never logged or echoed.
@Controller('auth/activation')
export class AccountActivationController {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db'],
    private readonly activation: AccountActivationService,
  ) {}

  private async checkOrigin(request: Request): Promise<void> {
    if (request.headers.origin !== readTrustedOrigin(process.env)) {
      await this.db.insert(authAudit).values({ action: 'denied' });
      throw new ForbiddenException('Request denied');
    }
  }

  private fields(request: Request, body: unknown, names: string[]): Record<string, string> {
    if (!request.is('application/json') || !body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid request');
    const input = body as Record<string, unknown>;
    if (names.some((name) => typeof input[name] !== 'string'))
      throw new BadRequestException('Invalid request');
    return input as Record<string, string>;
  }

  @Post('check')
  @HttpCode(200)
  async check(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    await this.checkOrigin(request);
    const token = parseActivationToken(this.fields(request, body, ['token']).token);
    if (!token) throw invalidLink();
    response.setHeader('Cache-Control', 'no-store');
    return this.activation.check(token);
  }

  @Post()
  @HttpCode(200)
  async activate(@Req() request: Request, @Body() body: unknown) {
    await this.checkOrigin(request);
    const input = this.fields(request, body, ['token', 'password']);
    const failedRules = failedPasswordRules(input.password);
    if (failedRules.length)
      throw new BadRequestException({ statusCode: 400, message: 'Weak password', failedRules });
    const token = parseActivationToken(input.token);
    if (!token) throw invalidLink();
    await this.activation.activate(token, input.password);
    return { activated: true };
  }
}
