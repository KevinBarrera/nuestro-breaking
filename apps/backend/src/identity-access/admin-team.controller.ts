import {
  type ArgumentMetadata,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  PipeTransform,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  parseAccessChangeInput,
  parseInviteInput,
  parseOptionalReasonInput,
  parseRequiredReasonInput,
} from './admin-team';
import { AdminTeamService } from './admin-team.service';
import { SessionAccessService } from './session-access.service';

/**
 * Validates a member id route parameter and passes it on in lowercase, the spelling PostgreSQL
 * returns and sessions carry, so every comparison with the caller's id sees the same string.
 */
@Injectable()
export class ParseMemberIdPipe implements PipeTransform<string, Promise<string>> {
  private readonly uuid = new ParseUUIDPipe();

  async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    return (await this.uuid.transform(value, metadata)).toLowerCase();
  }
}

/** Team management, limited to active global administrators (#214 D6). */
@Controller('admin/team')
export class AdminTeamController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly team: AdminTeamService,
  ) {}

  @Get()
  async list(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.sessions.authorizeGlobalAdmin(request, response);
    response.setHeader('Cache-Control', 'no-store');
    return { members: await this.team.list() };
  }

  /** The response is the only place the activation link is ever shown. */
  @Post()
  async invite(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseInviteInput(body);
    if (!parsed.ok)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid invitation',
        fieldErrors: parsed.fieldErrors,
      });
    response.setHeader('Cache-Control', 'no-store');
    return this.team.invite(parsed.value, actor);
  }

  @Post(':userId/invitation')
  async regenerate(
    @Param('userId', ParseMemberIdPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    response.setHeader('Cache-Control', 'no-store');
    return this.team.regenerate(userId, actor);
  }

  @Delete(':userId/invitation')
  @HttpCode(200)
  async cancel(
    @Param('userId', ParseMemberIdPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    await this.team.cancel(userId, actor);
    return { cancelled: true };
  }

  /** Replaces the member's access. Body: `{ access, reason? }`. Unchanged access is a no-op. */
  @Put(':userId/access')
  async changeAccess(
    @Param('userId', ParseMemberIdPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseAccessChangeInput(body);
    if (!parsed.ok) throw invalidRequest('Invalid access change', parsed.fieldErrors);
    return this.team.changeAccess(userId, parsed.value, actor);
  }

  /** Body: `{ reason }`, required. Revokes the member's sessions at once. */
  @Post(':userId/deactivate')
  @HttpCode(200)
  async deactivate(
    @Param('userId', ParseMemberIdPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseRequiredReasonInput(body);
    if (!parsed.ok) throw invalidRequest('Invalid deactivation', parsed.fieldErrors);
    return this.team.deactivate(userId, parsed.value, actor);
  }

  /** Body: `{ reason? }`. */
  @Post(':userId/reactivate')
  @HttpCode(200)
  async reactivate(
    @Param('userId', ParseMemberIdPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseOptionalReasonInput(body);
    if (!parsed.ok) throw invalidRequest('Invalid reactivation', parsed.fieldErrors);
    return this.team.reactivate(userId, parsed.value, actor);
  }
}

function invalidRequest(message: string, fieldErrors: Record<string, string>) {
  return new BadRequestException({ statusCode: 400, message, fieldErrors });
}
