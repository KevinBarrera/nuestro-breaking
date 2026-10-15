import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { RegistrationEntitlementsService } from './registration-entitlements.service';
import type { RegistrationEntitlements } from './registration-entitlements.types';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SELECTIONS = 500;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid body');
  return value as Record<string, unknown>;
}
function passTypeId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new BadRequestException('Invalid pass type');
  return value.toLowerCase();
}
function activityIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_SELECTIONS)
    throw new BadRequestException('Invalid activities');
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !UUID.test(entry))
      throw new BadRequestException('Invalid activity');
    const id = entry.toLowerCase();
    if (seen.has(id)) throw new BadRequestException('Duplicate activity');
    seen.add(id);
  }
  return [...seen];
}

@Controller('admin/events')
export class RegistrationEntitlementsController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  @Get(':eventId/registrations/:registrationId/entitlements')
  async read(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegistrationEntitlements> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.entitlements.read(eventId, registrationId);
  }

  @Post(':eventId/registrations/:registrationId/passes')
  async addPass(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const id = passTypeId(object(body).passTypeId);
    return this.entitlements.addPass(eventId, registrationId, id, actor);
  }

  @Put(':eventId/registrations/:registrationId/passes/:registrationPassId/selections')
  async replaceSelections(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('registrationPassId', ParseUUIDPipe) registrationPassId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const ids = activityIds(object(body).activityIds);
    return this.entitlements.replaceSelections(
      eventId,
      registrationId,
      registrationPassId,
      ids,
      actor,
    );
  }
}
