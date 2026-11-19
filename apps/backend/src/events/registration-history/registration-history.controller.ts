import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import type { FieldErrorCode } from '@/events/public-registration/public-registration.types';
import { decodeCursor } from './registration-history.projection';
import { RegistrationHistoryService } from './registration-history.service';
import {
  HISTORY_FILTERS,
  type HistoryFilter,
  type HistoryPage,
  type HistoryQuery,
} from './registration-history.types';

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 100;

function historyQuery(limit: unknown, cursor: unknown, filter: unknown, q: unknown): HistoryQuery {
  const errors: Record<string, FieldErrorCode> = {};
  let pageSize = LIMIT_DEFAULT;
  if (limit !== undefined) {
    const valid = typeof limit === 'string' && /^[1-9]\d{0,2}$/.test(limit);
    if (valid && Number(limit) <= LIMIT_MAX) pageSize = Number(limit);
    else errors.limit = 'invalid';
  }
  const after =
    cursor === undefined ? null : typeof cursor === 'string' ? decodeCursor(cursor) : null;
  if (cursor !== undefined && !after) errors.cursor = 'invalid';
  const scope = filter ?? 'all';
  if (!HISTORY_FILTERS.includes(scope as HistoryFilter)) errors.filter = 'invalid';
  // A blank search lists everything, as in the registrations search (#344, #356).
  const search = typeof q === 'string' ? q.trim() : '';
  if (
    q !== undefined &&
    (typeof q !== 'string' || (search && (search.length < 2 || search.length > 200)))
  )
    errors.q = 'invalid';
  if (Object.keys(errors).length > 0)
    throw new BadRequestException({
      statusCode: 400,
      message: 'Invalid history query',
      fieldErrors: errors,
    });
  return { limit: pageSize, cursor: after, filter: scope as HistoryFilter, q: search || null };
}

/** Read-only, redacted registration history of the event for its administrators (#104). */
@Controller('admin/events')
export class RegistrationHistoryController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly history: RegistrationHistoryService,
  ) {}

  @Get(':eventId/registration-history')
  async read(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('limit') limit: unknown,
    @Query('cursor') cursor: unknown,
    @Query('filter') filter: unknown,
    @Query('q') q: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<HistoryPage> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.history.read(eventId, historyQuery(limit, cursor, filter, q));
  }
}
