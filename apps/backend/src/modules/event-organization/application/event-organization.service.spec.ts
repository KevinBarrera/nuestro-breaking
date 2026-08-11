import { EventOrganizationService, type CreateEventInput } from './event-organization.service';
import { EventOrganizationRepository } from '@/modules/event-organization/infrastructure/event-organization.repository';

describe('EventOrganizationService', () => {
  const baseEvent = {
    id: 'event-1',
    organizationId: 'organization-1',
    organizerUserId: 'organizer-1',
    venueId: 'venue-1',
    venueName: 'Centro Cultural',
    lifecycle: 'draft' as const,
    startsAt: new Date('2026-06-10T15:30:00.000Z'),
    endsAt: null,
  };

  let repository: {
    createEvent: jest.Mock;
    findEventById: jest.Mock;
    publishEvent: jest.Mock;
  };
  let service: EventOrganizationService;

  beforeEach(() => {
    repository = {
      createEvent: jest.fn(),
      findEventById: jest.fn(),
      publishEvent: jest.fn(),
    };
    service = new EventOrganizationService(repository as unknown as EventOrganizationRepository);
  });

  it('keeps a named venue and normalizes a timezone-aware startsAt value', async () => {
    repository.createEvent.mockResolvedValue(baseEvent);
    const input: CreateEventInput = {
      organizationId: 'organization-1',
      organizerUserId: 'organizer-1',
      venueId: 'venue-1',
      name: 'Breaking Summer Jam',
      startsAt: '2026-06-10T09:30:00-06:00',
    };

    await expect(service.createEvent(input)).resolves.toEqual(baseEvent);
    expect(repository.createEvent).toHaveBeenCalledWith({
      ...input,
      startsAt: new Date('2026-06-10T15:30:00.000Z'),
    });
  });

  it('rejects a startsAt value without an explicit timezone offset', async () => {
    const input: CreateEventInput = {
      organizationId: 'organization-1',
      organizerUserId: 'organizer-1',
      venueId: 'venue-1',
      name: 'Breaking Summer Jam',
      startsAt: '2026-06-10T09:30:00',
    };

    await expect(service.createEvent(input)).rejects.toThrow(
      'startsAt must include a timezone offset.',
    );
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it('rejects missing, unpublished, and closed event scope for operations', async () => {
    repository.findEventById.mockResolvedValueOnce(undefined);
    await expect(service.requireOperationalEvent('missing-event')).rejects.toThrow(
      'Event scope is invalid.',
    );

    repository.findEventById.mockResolvedValueOnce(baseEvent);
    await expect(service.requireOperationalEvent(baseEvent.id)).rejects.toThrow(
      'Event is not published.',
    );

    repository.findEventById.mockResolvedValueOnce({
      ...baseEvent,
      lifecycle: 'closed',
    });
    await expect(service.requireOperationalEvent(baseEvent.id)).rejects.toThrow('Event is closed.');
  });

  it('publishes an event only when the trusted actor is its organizer', async () => {
    repository.findEventById.mockResolvedValue(baseEvent);
    repository.publishEvent.mockResolvedValue({
      ...baseEvent,
      lifecycle: 'published',
    });

    await expect(
      service.publishEvent({ eventId: baseEvent.id, actorUserId: 'other-user' }),
    ).rejects.toThrow('Only the organizer can publish this event.');
    expect(repository.publishEvent).not.toHaveBeenCalled();

    await expect(
      service.publishEvent({
        eventId: baseEvent.id,
        actorUserId: baseEvent.organizerUserId,
      }),
    ).resolves.toMatchObject({ lifecycle: 'published' });
    expect(repository.publishEvent).toHaveBeenCalledWith(baseEvent.id);
  });
});
