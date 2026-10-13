import { BadRequestException } from '@nestjs/common';
import type { EventFieldError } from './admin-event-input';

/** The `400` for invalid event input, shared by the controller and the service's merged checks. */
export function invalidEvent(fieldErrors: Record<string, EventFieldError>) {
  return new BadRequestException({ statusCode: 400, message: 'Invalid event', fieldErrors });
}
