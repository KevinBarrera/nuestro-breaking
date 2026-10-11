import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { parseInviteInput } from './admin-team';
import { AdminTeamService } from './admin-team.service';
import { SessionAccessService } from './session-access.service';

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
    @Param('userId', ParseUUIDPipe) userId: string,
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
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    await this.team.cancel(userId, actor);
    return { cancelled: true };
  }
}
