import { describe, expect, it } from 'vitest';
import { readAttendeeLists } from './readers';

const passType = { id: 'p1', name: 'Pase completo', passClass: 'full', status: 'active' };
const activity = {
  id: 'a1',
  name: 'Batalla 1vs1',
  kind: 'competition',
  startsAt: '2026-11-14T18:00:00.000Z',
};
const registration = {
  registrationId: 'r1',
  folio: 'EB-7K3Q',
  fullName: 'Ana López',
  stageName: 'Flash',
  status: 'confirmed',
  eventCheckedInAt: '2026-11-14T16:05:00.000Z',
  passTypeIds: ['p1'],
  activities: [{ activityId: 'a1', checkedInAt: null }],
};
const body = {
  event: { id: 'e1', name: 'Encuentro del barrio' },
  generatedAt: '2026-11-13T20:00:00.000Z',
  passTypes: [passType, { ...passType, id: 'p2', name: 'Pase viejo', status: 'archived' }],
  activities: [activity],
  registrations: [registration],
};

describe('readAttendeeLists', () => {
  it('reads a snapshot and marks archived pass types', () => {
    const lists = readAttendeeLists(body);
    expect(lists?.event).toEqual({ id: 'e1', name: 'Encuentro del barrio' });
    expect(lists?.generatedAt).toBe(body.generatedAt);
    expect(lists?.passTypes.map((pass) => pass.archived)).toEqual([false, true]);
    expect(lists?.registrations).toEqual([registration]);
  });

  it('reads an event without registrations', () => {
    expect(
      readAttendeeLists({ ...body, passTypes: [], activities: [], registrations: [] }),
    ).toMatchObject({ passTypes: [], activities: [], registrations: [] });
  });

  // A backend that leaked contact fields must not carry them into the screen.
  it('keeps only the contact-free fields of each registration', () => {
    const leaked = { ...registration, email: 'ana@example.org', phone: '+52 5512345678' };
    const [row] = readAttendeeLists({ ...body, registrations: [leaked] })!.registrations;
    expect(Object.keys(row).sort()).toEqual(Object.keys(registration).sort());
  });

  it('rejects malformed snapshots', () => {
    expect(readAttendeeLists(null)).toBeNull();
    expect(readAttendeeLists({ ...body, generatedAt: 'ayer' })).toBeNull();
    expect(readAttendeeLists({ ...body, event: { id: 'e1' } })).toBeNull();
    expect(
      readAttendeeLists({ ...body, passTypes: [{ ...passType, passClass: 'vip' }] }),
    ).toBeNull();
    expect(
      readAttendeeLists({ ...body, activities: [{ ...activity, kind: 'social' }] }),
    ).toBeNull();
    expect(
      readAttendeeLists({ ...body, registrations: [{ ...registration, status: 'voided' }] }),
    ).toBeNull();
    expect(
      readAttendeeLists({ ...body, registrations: [{ ...registration, folio: 7 }] }),
    ).toBeNull();
    expect(
      readAttendeeLists({
        ...body,
        registrations: [{ ...registration, eventCheckedInAt: 'temprano' }],
      }),
    ).toBeNull();
    expect(
      readAttendeeLists({
        ...body,
        registrations: [{ ...registration, activities: [{ activityId: 'a1' }] }],
      }),
    ).toBeNull();
    expect(
      readAttendeeLists({ ...body, registrations: [{ ...registration, passTypeIds: [1] }] }),
    ).toBeNull();
  });
});
