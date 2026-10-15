import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { normalizeEmail } from '@/events/participant-profile/participant-normalization';
import { ManualRegistrationService } from './manual-registration.service';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';

function required(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException('Invalid required field');
  return value.trim();
}
function optional(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException('Invalid optional field');
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid body');
  return value as Record<string, unknown>;
}

@Controller('admin/events')
export class ManualRegistrationController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly operations: ManualRegistrationService,
  ) {}

  @Post(':eventId/registrations/manual')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const input = object(body);
    const fullName = required(input.fullName, 200);
    const phone = required(input.phone, 100);
    const trimmedEmail = optional(input.email, 320);
    const email = trimmedEmail === null ? null : normalizeEmail(trimmedEmail);
    const activityIds = input.activityIds === undefined ? [] : input.activityIds;
    if (
      !Array.isArray(activityIds) ||
      activityIds.length > 100 ||
      activityIds.some(
        (id) =>
          typeof id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      ) ||
      new Set(activityIds).size !== activityIds.length
    ) {
      throw new BadRequestException('Invalid activities');
    }
    return this.operations.create(
      eventId,
      { fullName, phone, email, activityIds: activityIds as string[] },
      actor,
    );
  }

  @Post(':eventId/registrations/:registrationId/cash-confirmation')
  async confirm(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const input = object(body);
    if (
      !Number.isSafeInteger(input.amount) ||
      (input.amount as number) <= 0 ||
      (input.amount as number) > 2147483647
    )
      throw new BadRequestException('Invalid amount in cents');
    return this.operations.confirm(
      eventId,
      registrationId,
      {
        amount: input.amount as number,
        reference: optional(input.reference, 200),
        note: optional(input.note, 500),
        receipt: optional(input.receipt, 200),
      },
      actor,
    );
  }
}
