import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { ActivityAdminService } from './activity-admin.service';
import type { ActivityChanges, ActivityDraft, AdminActivity } from './activity-admin.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid body');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`Invalid ${field}`);
  return value.trim();
}
function venue(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new BadRequestException('Invalid venue');
  return value.toLowerCase();
}
function instant(value: unknown, field: string): Date {
  const parsed = typeof value === 'string' && ISO_INSTANT.test(value) ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new BadRequestException(`Invalid ${field}`);
  return parsed;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > 2147483647)
    throw new BadRequestException('Invalid expected version');
  return value as number;
}

const fields = {
  venueId: (value: unknown) => venue(value),
  kind: (value: unknown) => text(value, 100, 'kind'),
  name: (value: unknown) => text(value, 200, 'name'),
  startsAt: (value: unknown) => instant(value, 'start'),
  endsAt: (value: unknown) => instant(value, 'end'),
};

@Controller('admin/events')
export class ActivityAdminController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly catalog: ActivityAdminService,
  ) {}

  @Get(':eventId/activities')
  async list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminActivity[]> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.catalog.list(eventId);
  }

  @Post(':eventId/activities')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminActivity> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const input = object(body);
    const draft: ActivityDraft = {
      venueId: fields.venueId(input.venueId),
      kind: fields.kind(input.kind),
      name: fields.name(input.name),
      startsAt: fields.startsAt(input.startsAt),
      endsAt: fields.endsAt(input.endsAt),
    };
    return this.catalog.create(eventId, draft, actor);
  }

  @Patch(':eventId/activities/:activityId')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminActivity> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const input = object(body);
    const changes: ActivityChanges = { expectedVersion: version(input.expectedVersion) };
    let changed = false;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      if (input[key] === undefined) continue;
      Object.assign(changes, { [key]: fields[key](input[key]) });
      changed = true;
    }
    if (!changed) throw new BadRequestException('Invalid update');
    return this.catalog.update(eventId, activityId, changes, actor);
  }

  @Post(':eventId/activities/:activityId/archive')
  async archive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminActivity> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const expectedVersion = version(object(body).expectedVersion);
    return this.catalog.archive(eventId, activityId, expectedVersion, actor);
  }

  @Post(':eventId/activities/:activityId/restore')
  async restore(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminActivity> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const expectedVersion = version(object(body).expectedVersion);
    return this.catalog.restore(eventId, activityId, expectedVersion, actor);
  }
}
