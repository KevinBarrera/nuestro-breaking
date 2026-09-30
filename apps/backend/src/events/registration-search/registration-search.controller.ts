import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventFoundationGuard } from '@/events/foundation/event-foundation.guard';
import { RegistrationSearchService } from './registration-search.service';
import { type RegistrationSearchPage } from './registration-search.types';

function pageNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException('Invalid pagination');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new BadRequestException('Invalid pagination');
  }
  return number;
}

@Controller('admin/events')
export class RegistrationSearchController {
  constructor(private readonly search: RegistrationSearchService) {}

  @Get(':eventId/participants')
  @UseGuards(EventFoundationGuard)
  getParticipants(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('q') q: unknown,
    @Query('limit') requestedLimit: unknown,
    @Query('offset') requestedOffset: unknown,
  ): Promise<RegistrationSearchPage> {
    if (typeof q !== 'string' || q.trim().length < 2 || q.trim().length > 200) {
      throw new BadRequestException('Invalid search query');
    }
    const limit = pageNumber(requestedLimit, 20, 1, 50);
    const offset = pageNumber(requestedOffset, 0, 0, 100_000);
    return this.search.search(eventId, q.trim(), limit, offset);
  }
}
