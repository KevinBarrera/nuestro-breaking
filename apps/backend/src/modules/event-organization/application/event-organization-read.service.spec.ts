import { EventOrganizationReadService } from './event-organization-read.service';
import { assertLocalSeedEnvironment } from '@/modules/event-organization/infrastructure/local-seed-policy';

describe('EventOrganizationReadService', () => {
  const organization = { id: 'organization-a', name: 'Organization A' };
  const events = [
    {
      id: 'event-a',
      name: 'Summer Jam',
      venue: { id: 'venue-a', name: 'Main Hall' },
      schedule: { startsAt: new Date('2026-06-10T15:30:00.000Z'), endsAt: null },
    },
  ];

  it('returns only the requested organization event view', async () => {
    const repository = {
      findOrganizationView: jest.fn().mockResolvedValue({ organization, events }),
    };
    const service = new EventOrganizationReadService(repository);

    await expect(service.listOrganizationEvents(organization.id)).resolves.toEqual({
      organization,
      events,
    });
    expect(repository.findOrganizationView).toHaveBeenCalledWith(organization.id);
  });

  it('keeps an unknown organization separate from a populated organization', async () => {
    const repository = { findOrganizationView: jest.fn().mockResolvedValue(undefined) };
    const service = new EventOrganizationReadService(repository);

    await expect(service.listOrganizationEvents('organization-b')).resolves.toBeUndefined();
    expect(repository.findOrganizationView).toHaveBeenCalledWith('organization-b');
  });
});

describe('local seed policy', () => {
  it.each([
    [
      { LOCAL_SEED: '0' },
      'postgresql://user:pass@localhost:5432/local',
      'LOCAL_SEED=1 is required.',
    ],
    [
      { LOCAL_SEED: '1', NODE_ENV: 'production' },
      'postgresql://user:pass@localhost:5432/local',
      'Local seed refuses production.',
    ],
    [
      { LOCAL_SEED: '1' },
      'postgresql://user:pass@db.example.com:5432/live',
      'Local seed requires a loopback database host.',
    ],
  ])('rejects unsafe seed environment %#', (environment, databaseUrl, message) => {
    expect(() => assertLocalSeedEnvironment(environment, databaseUrl)).toThrow(message);
  });

  it('allows an explicit local opt-in against the persistent Docker database', () => {
    expect(() =>
      assertLocalSeedEnvironment(
        { LOCAL_SEED: '1' },
        'postgresql://user:pass@localhost:5432/local',
      ),
    ).not.toThrow();
  });
});
