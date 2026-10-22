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
import {
  PARTICIPANT_FIELD_KEYS,
  parseParticipantFields,
} from '@/events/public-registration/public-registration-request';
import type { FieldErrorCode } from '@/events/public-registration/public-registration.types';
import { CASH_RECEIPT_MAX, isCashAmount } from './cash-payment-rules';
import { ManualRegistrationService } from './manual-registration.service';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const REASON_MAX = 500;
const BODY_KEYS = new Set([
  ...PARTICIPANT_FIELD_KEYS,
  'activityIds',
  'confirmedDuplicateRegistrationIds',
]);

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
// Optional list of unique UUIDs, lowercased; null when the value is not such a list.
function uuidList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IDS) return null;
  if (value.some((id) => typeof id !== 'string' || !UUID.test(id))) return null;
  const ids = (value as string[]).map((id) => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
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
    const errors: Record<string, FieldErrorCode> = {};
    for (const key of Object.keys(input)) if (!BODY_KEYS.has(key)) errors[key] = 'unknown_field';
    // Same #58 fields and normalization as public registration (#125); the UTC date is the latest
    // accepted birth date, as there.
    const participant = parseParticipantFields(
      input,
      new Date().toISOString().slice(0, 10),
      '',
      errors,
    );
    const activityIds = uuidList(input.activityIds);
    if (!activityIds) errors.activityIds = 'invalid';
    const confirmedDuplicateRegistrationIds = uuidList(input.confirmedDuplicateRegistrationIds);
    if (!confirmedDuplicateRegistrationIds) errors.confirmedDuplicateRegistrationIds = 'invalid';
    if (Object.keys(errors).length > 0 || !participant || !activityIds)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid manual registration',
        fieldErrors: errors,
      });
    return this.operations.create(
      eventId,
      {
        participant,
        activityIds,
        confirmedDuplicateRegistrationIds: confirmedDuplicateRegistrationIds ?? [],
      },
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
    if (!isCashAmount(input.amount)) throw new BadRequestException('Invalid amount in cents');
    // The paper receipt number (#125): required, stored trimmed and unique within the event.
    const receipt = typeof input.receipt === 'string' ? input.receipt.trim() : '';
    if (!receipt || receipt.length > CASH_RECEIPT_MAX)
      throw new BadRequestException('Receipt number is required and must be 1 to 50 characters');
    return this.operations.confirm(
      eventId,
      registrationId,
      {
        amount: input.amount,
        reference: optional(input.reference, 200),
        note: optional(input.note, 500),
        receipt,
      },
      actor,
    );
  }

  /** Confirms a $0 registration without payment (#263); the reason is required evidence. */
  @Post(':eventId/registrations/:registrationId/complimentary-confirmation')
  async confirmComplimentary(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const session = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const actor: AdminRegistrationAuditActor = { kind: 'admin', ...session };
    const input = object(body);
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > REASON_MAX)
      throw new BadRequestException('Reason is required and must be 1 to 500 characters');
    return this.operations.confirmComplimentary(eventId, registrationId, reason, actor);
  }
}
