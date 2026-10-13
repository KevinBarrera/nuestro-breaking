import { toAdminEvent, toAdminEventSummary } from './admin-event.read-model';

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
  };

  it('maps a summary with only the list fields and ISO dates', () => {
    expect(toAdminEventSummary({ ...row, archivedAt: new Date('2026-10-01T12:00:00Z') })).toEqual({
      id: row.id,
      name: row.name,
      slug: 'los-mas-pesados',
      folioPrefix: 'LMP',
      archivedAt: '2026-10-01T12:00:00.000Z',
    });
  });

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
    });
    expect(toAdminEvent({ ...row, startsAt: null, endsAt: null })).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
  });
});
