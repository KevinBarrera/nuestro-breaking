import { toAdminEvent } from './admin-event.read-model';

describe('admin event read model', () => {
  const row = {
    id: '00000000-0000-4000-8000-000000000213',
    name: 'Los más pesados',
    slug: 'los-mas-pesados',
    folioPrefix: 'LMP',
    archivedAt: null,
    timeZone: 'America/Mexico_City',
    startsAt: new Date('2026-11-14T16:00:00Z'),
    endsAt: new Date('2026-11-16T04:00:00Z'),
    salesEnabled: false,
    city: 'Guadalajara',
    state: 'Jalisco',
    country: 'MX',
  };

  it('maps a full event, keeping missing dates as null', () => {
    expect(toAdminEvent(row)).toEqual({
      id: row.id,
      name: row.name,
      slug: 'los-mas-pesados',
      folioPrefix: 'LMP',
      archivedAt: null,
      timeZone: 'America/Mexico_City',
      startsAt: '2026-11-14T16:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
      salesEnabled: false,
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
    });
    expect(toAdminEvent({ ...row, startsAt: null, endsAt: null })).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
    expect(
      toAdminEvent({ ...row, archivedAt: new Date('2026-10-01T12:00:00Z'), salesEnabled: true }),
    ).toMatchObject({ archivedAt: '2026-10-01T12:00:00.000Z', salesEnabled: true });
  });

  it('keeps an event without a location as null fields', () => {
    expect(toAdminEvent({ ...row, city: null, state: null, country: null })).toMatchObject({
      city: null,
      state: null,
      country: null,
    });
  });
});
