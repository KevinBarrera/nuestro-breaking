import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { parseOffsetDateTime } from './date-time';
import { EventSalesService } from './event-sales.service';
import type { AdminEventSales, EventSalesChanges } from './event-sales.types';

const KEYS: readonly string[] = ['salesEnabled', 'salesOpensAt', 'salesClosesAt'];

function changes(value: unknown): EventSalesChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid body');
  const input = value as Record<string, unknown>;
  // PUT replaces every setting; the slug and any other key are not editable here.
  if (Object.keys(input).some((key) => !KEYS.includes(key)) || KEYS.some((key) => !(key in input)))
    throw new BadRequestException('Invalid body');
  if (typeof input.salesEnabled !== 'boolean')
    throw new BadRequestException('Invalid sales switch');
  const salesOpensAt = dateTime(input.salesOpensAt, 'Invalid sales opening date');
  const salesClosesAt = dateTime(input.salesClosesAt, 'Invalid sales closing date');
  if (salesOpensAt && salesClosesAt && salesOpensAt >= salesClosesAt)
    throw new BadRequestException('Sales must open before they close');
  return { salesEnabled: input.salesEnabled, salesOpensAt, salesClosesAt };
}

function dateTime(value: unknown, message: string): Date | null {
  if (value === null) return null;
  const date = typeof value === 'string' ? parseOffsetDateTime(value) : null;
  if (!date) throw new BadRequestException(message);
  return date;
}

@Controller('admin/events')
export class EventSalesController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly sales: EventSalesService,
  ) {}

  @Get(':eventId/sales')
  async get(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminEventSales> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.sales.get(eventId);
  }

  @Put(':eventId/sales')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminEventSales> {
    await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    return this.sales.update(eventId, changes(body));
  }
}
