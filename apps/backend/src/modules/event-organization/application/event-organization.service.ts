import { Injectable } from '@nestjs/common';
import {
  EventOrganizationRepository,
  type EventOrganizationEvent,
} from '@/modules/event-organization/infrastructure/event-organization.repository';

export type CreateEventInput = {
  organizationId: string;
  organizerUserId: string;
  venueId: string;
  name: string;
  startsAt: string;
};

@Injectable()
export class EventOrganizationService {
  constructor(private readonly repository: EventOrganizationRepository) {}
  async createEvent(input: CreateEventInput): Promise<EventOrganizationEvent> {
    const startsAt = new Date(input.startsAt);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(input.startsAt) || Number.isNaN(startsAt.getTime())) {
      throw new Error('startsAt must include a timezone offset.');
    }
    return this.repository.createEvent({ ...input, startsAt });
  }
  async requireOperationalEvent(eventId: string): Promise<EventOrganizationEvent> {
    const event = await this.repository.findEventById(eventId);
    if (!event) throw new Error('Event scope is invalid.');
    if (event.lifecycle === 'closed') throw new Error('Event is closed.');
    if (event.lifecycle !== 'published') throw new Error('Event is not published.');
    return event;
  }
  async publishEvent(input: { eventId: string; actorUserId: string }) {
    const event = await this.repository.findEventById(input.eventId);
    if (!event) throw new Error('Event scope is invalid.');
    if (event.organizerUserId !== input.actorUserId) {
      throw new Error('Only the organizer can publish this event.');
    }
    return this.repository.publishEvent(input.eventId);
  }
}
