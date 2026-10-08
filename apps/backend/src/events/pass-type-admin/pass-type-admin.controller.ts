import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { PassTypeAdminService } from './pass-type-admin.service';
import type {
  AdminPassType,
  PassClass,
  PassTypeActivity,
  PassTypeChanges,
  PassTypeDraft,
  RequiredPassClass,
} from './pass-type-admin.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASS_CLASSES: readonly string[] = ['full', 'general', 'add_on'];
const REQUIRED_CLASSES: readonly string[] = ['full', 'general'];
const ACCESS_VALUES: readonly string[] = ['selectable', 'included'];
const MAX_INT = 2147483647;
const MAX_ACTIVITIES = 500;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid body');
  return value as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    throw new BadRequestException('Invalid name');
  return value.trim();
}
function passClass(value: unknown): PassClass {
  if (typeof value !== 'string' || !PASS_CLASSES.includes(value))
    throw new BadRequestException('Invalid pass class');
  return value as PassClass;
}
function price(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_INT)
    throw new BadRequestException('Invalid price');
  return value as number;
}
function requiredClass(value: unknown): RequiredPassClass | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !REQUIRED_CLASSES.includes(value))
    throw new BadRequestException('Invalid required pass class');
  return value as RequiredPassClass;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_INT)
    throw new BadRequestException('Invalid expected version');
  return value as number;
}
function accessList(value: unknown): PassTypeActivity[] {
  if (!Array.isArray(value) || value.length > MAX_ACTIVITIES)
    throw new BadRequestException('Invalid activities');
  const seen = new Set<string>();
  return value.map((entry) => {
    const item = object(entry);
    if (typeof item.activityId !== 'string' || !UUID.test(item.activityId))
      throw new BadRequestException('Invalid activity');
    if (typeof item.access !== 'string' || !ACCESS_VALUES.includes(item.access))
      throw new BadRequestException('Invalid activity access');
    const activityId = item.activityId.toLowerCase();
    if (seen.has(activityId)) throw new BadRequestException('Duplicate activity');
    seen.add(activityId);
    return { activityId, access: item.access as PassTypeActivity['access'] };
  });
}

const fields = {
  name,
  passClass,
  priceCents: price,
  requiresPassClass: requiredClass,
};

@Controller('admin/events')
export class PassTypeAdminController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly catalog: PassTypeAdminService,
  ) {}

  @Get(':eventId/pass-types')
  async list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminPassType[]> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.catalog.list(eventId);
  }

  @Post(':eventId/pass-types')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminPassType> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const input = object(body);
    const draft: PassTypeDraft = {
      name: fields.name(input.name),
      passClass: fields.passClass(input.passClass),
      priceCents: fields.priceCents(input.priceCents),
      requiresPassClass:
        input.requiresPassClass === undefined
          ? null
          : fields.requiresPassClass(input.requiresPassClass),
      activities: input.activities === undefined ? [] : accessList(input.activities),
    };
    return this.catalog.create(eventId, draft, actor);
  }

  @Patch(':eventId/pass-types/:passTypeId')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('passTypeId', ParseUUIDPipe) passTypeId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminPassType> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const input = object(body);
    const changes: PassTypeChanges = { expectedVersion: version(input.expectedVersion) };
    let changed = false;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      if (input[key] === undefined) continue;
      Object.assign(changes, { [key]: fields[key](input[key]) });
      changed = true;
    }
    if (!changed) throw new BadRequestException('Invalid update');
    return this.catalog.update(eventId, passTypeId, changes, actor);
  }

  @Put(':eventId/pass-types/:passTypeId/activities')
  async replaceActivities(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('passTypeId', ParseUUIDPipe) passTypeId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminPassType> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const input = object(body);
    const expectedVersion = version(input.expectedVersion);
    const activities = accessList(input.activities);
    return this.catalog.replaceActivities(eventId, passTypeId, expectedVersion, activities, actor);
  }

  @Post(':eventId/pass-types/:passTypeId/archive')
  async archive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('passTypeId', ParseUUIDPipe) passTypeId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminPassType> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const expectedVersion = version(object(body).expectedVersion);
    return this.catalog.archive(eventId, passTypeId, expectedVersion, actor);
  }

  @Post(':eventId/pass-types/:passTypeId/restore')
  async restore(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('passTypeId', ParseUUIDPipe) passTypeId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminPassType> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const expectedVersion = version(object(body).expectedVersion);
    return this.catalog.restore(eventId, passTypeId, expectedVersion, actor);
  }
}
