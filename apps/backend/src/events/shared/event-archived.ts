import { ConflictException } from '@nestjs/common';

/**
 * The `409 event_archived` answered by admin writes that an archived event refuses (#213 D6): edits,
 * archiving twice and turning sales on.
 */
export function eventArchived() {
  return new ConflictException({
    statusCode: 409,
    message: 'Event is archived',
    code: 'event_archived',
  });
}
