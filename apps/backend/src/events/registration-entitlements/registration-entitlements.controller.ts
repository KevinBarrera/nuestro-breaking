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
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import type { FieldErrorCode } from '@/events/public-registration/public-registration.types';
import {
  REASON_MESSAGE,
  RegistrationEntitlementsService,
} from './registration-entitlements.service';
import type {
  DisciplineSwap,
  ParticipantCorrection,
  RegistrationEntitlements,
} from './registration-entitlements.types';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SELECTIONS = 500;
const REASON_MAX = 500;
const NAME_MAX = 100;
const CORRECTION_KEYS = new Set([
  'firstName',
  'firstLastName',
  'secondLastName',
  'stageName',
  'reason',
  'confirmCrossEvent',
]);
const SWAP_KEYS = new Set(['toPassTypeId', 'activityIds', 'reason']);

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
// A blank reason counts as missing; the service decides whether one is required.
function reason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > REASON_MAX)
    throw new BadRequestException(REASON_MESSAGE);
  return value.trim() || null;
}
// Any invalid reason counts as missing, so the service rejects it once the registration is found.
function requiredReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= REASON_MAX ? trimmed || null : null;
}

// The name parts and AKA of a correction (#104), trimmed and with inner whitespace collapsed before
// the 100-character bound. Absent, null or blank optional parts clear them. The reason is checked
// by the service once the registration is found.
function participantCorrection(input: Record<string, unknown>): ParticipantCorrection {
  const errors: Record<string, FieldErrorCode> = {};
  for (const key of Object.keys(input))
    if (!CORRECTION_KEYS.has(key)) errors[key] = 'unknown_field';
  const name = (key: string, required: boolean): string | null => {
    const value = input[key];
    if (typeof value !== 'string' && value !== undefined && value !== null) {
      errors[key] = 'invalid';
      return null;
    }
    const collapsed = (typeof value === 'string' ? value : '').trim().replace(/\s+/g, ' ');
    if (!collapsed) {
      if (required) errors[key] = 'required';
      return null;
    }
    if (collapsed.length > NAME_MAX) errors[key] = 'too_long';
    return collapsed;
  };
  const firstName = name('firstName', true);
  const firstLastName = name('firstLastName', true);
  const secondLastName = name('secondLastName', false);
  const stageName = name('stageName', false);
  const confirm = input.confirmCrossEvent;
  if (confirm !== undefined && typeof confirm !== 'boolean') errors.confirmCrossEvent = 'invalid';
  if (Object.keys(errors).length > 0 || !firstName || !firstLastName)
    throw new BadRequestException({
      statusCode: 400,
      message: 'Invalid participant correction',
      fieldErrors: errors,
    });
  return {
    firstName,
    firstLastName,
    secondLastName,
    stageName,
    confirmCrossEvent: confirm === true,
  };
}

// The target pass type and competitions of a discipline swap (#104), with field errors in the
// public registration codes. The reason is checked by the service once the registration is found.
function disciplineSwap(input: Record<string, unknown>): DisciplineSwap {
  const errors: Record<string, FieldErrorCode> = {};
  for (const key of Object.keys(input)) if (!SWAP_KEYS.has(key)) errors[key] = 'unknown_field';
  const target = input.toPassTypeId;
  if (target === undefined || target === null) errors.toPassTypeId = 'required';
  else if (typeof target !== 'string' || !UUID.test(target)) errors.toPassTypeId = 'invalid';
  const ids: string[] = [];
  const chosen = input.activityIds;
  if (chosen === undefined || chosen === null) errors.activityIds = 'required';
  else if (!Array.isArray(chosen)) errors.activityIds = 'invalid';
  else if (chosen.length > MAX_SELECTIONS) errors.activityIds = 'too_many';
  else
    chosen.forEach((entry: unknown, index) => {
      if (typeof entry !== 'string' || !UUID.test(entry))
        errors[`activityIds[${index}]`] = 'invalid';
      else if (ids.includes(entry.toLowerCase())) errors[`activityIds[${index}]`] = 'duplicate';
      else ids.push(entry.toLowerCase());
    });
  if (Object.keys(errors).length > 0 || typeof target !== 'string')
    throw new BadRequestException({
      statusCode: 400,
      message: 'Invalid discipline swap',
      fieldErrors: errors,
    });
  return { toPassTypeId: target.toLowerCase(), activityIds: ids };
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

  @Delete(':eventId/registrations/:registrationId/passes/:registrationPassId')
  async removePass(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('registrationPassId', ParseUUIDPipe) registrationPassId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    return this.entitlements.removePass(eventId, registrationId, registrationPassId, actor);
  }

  @Post(':eventId/registrations/:registrationId/void')
  @HttpCode(200)
  async voidRegistration(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const reason = requiredReason(object(body).reason);
    return this.entitlements.voidRegistration(eventId, registrationId, reason, actor);
  }

  @Post(':eventId/registrations/:registrationId/participant-correction')
  @HttpCode(200)
  async correctParticipant(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const input = object(body);
    const correction = participantCorrection(input);
    const reason = requiredReason(input.reason);
    return this.entitlements.correctParticipant(eventId, registrationId, correction, reason, actor);
  }

  @Post(':eventId/registrations/:registrationId/discipline-swap')
  @HttpCode(200)
  async swapDiscipline(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<RegistrationEntitlements> {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const input = object(body);
    const swap = disciplineSwap(input);
    const reason = requiredReason(input.reason);
    return this.entitlements.swapDiscipline(eventId, registrationId, swap, reason, actor);
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
    const input = object(body);
    const ids = activityIds(input.activityIds);
    return this.entitlements.replaceSelections(
      eventId,
      registrationId,
      registrationPassId,
      ids,
      reason(input.reason),
      actor,
    );
  }
}
