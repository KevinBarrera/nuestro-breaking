import type { AttendeeLists, AttendeeListRegistration } from '@/entities/attendee-list';
import { describe, expect, it } from 'vitest';
import {
  allListsOption,
  attendanceLabel,
  buildAttendeeLists,
  folioLabel,
  formatGeneratedAt,
  peopleCount,
  visibleLists,
} from './attendee-lists-model';

const zone = 'America/Mexico_City';

const person = (
  registrationId: string,
  fullName: string,
  overrides: Partial<AttendeeListRegistration> = {},
): AttendeeListRegistration => ({
  registrationId,
  folio: null,
  fullName,
  stageName: null,
  status: 'confirmed',
  eventCheckedInAt: null,
  passTypeIds: [],
  activities: [],
  ...overrides,
});

const snapshot: AttendeeLists = {
  event: { id: 'e1', name: 'Encuentro del barrio' },
  generatedAt: '2026-11-13T20:00:00.000Z',
  passTypes: [
    { id: 'full', name: 'Pase completo', passClass: 'full', archived: false },
    { id: 'old', name: 'Pase preventa', passClass: 'general', archived: true },
  ],
  activities: [
    { id: 'battle', name: 'Batalla 1vs1', kind: 'competition', startsAt: '2026-11-14T18:00:00Z' },
    { id: 'class', name: 'Clase de toprock', kind: 'workshop', startsAt: '2026-11-14T19:00:00Z' },
  ],
  registrations: [
    person('r1', 'Ana López', {
      folio: 'EB-7K3Q',
      stageName: 'Flash',
      eventCheckedInAt: '2026-11-14T16:05:00Z',
      passTypeIds: ['full'],
      activities: [
        { activityId: 'battle', checkedInAt: '2026-11-14T18:10:00Z' },
        { activityId: 'class', checkedInAt: null },
      ],
    }),
    person('r2', 'Beto Ruiz', {
      status: 'pending_payment',
      passTypeIds: ['full', 'old'],
      activities: [{ activityId: 'class', checkedInAt: null }],
    }),
  ],
};

describe('buildAttendeeLists', () => {
  it('orders the event list, then one list per pass type and per activity', () => {
    expect(buildAttendeeLists(snapshot).map((list) => list.title)).toEqual([
      'Evento completo',
      'Pase · Pase completo',
      'Pase · Pase preventa (archivado)',
      'Competencia · Batalla 1vs1',
      'Taller · Clase de toprock',
    ]);
  });

  it('puts each person on the lists of what they hold', () => {
    const names = buildAttendeeLists(snapshot).map((list) => list.rows.map((row) => row.fullName));
    expect(names).toEqual([
      ['Ana López', 'Beto Ruiz'],
      ['Ana López', 'Beto Ruiz'],
      ['Beto Ruiz'],
      ['Ana López'],
      ['Ana López', 'Beto Ruiz'],
    ]);
  });

  it('shows the passes only on the event list', () => {
    const [event, pass] = buildAttendeeLists(snapshot);
    expect(event.showPasses).toBe(true);
    expect(event.rows.map((row) => row.passes)).toEqual([
      ['Pase completo'],
      ['Pase completo', 'Pase preventa'],
    ]);
    expect(pass.showPasses).toBe(false);
  });

  it('uses event attendance on event and pass lists and the activity check-in on activity lists', () => {
    const [event, pass, , battle, workshop] = buildAttendeeLists(snapshot);
    expect(event.rows[0].checkedInAt).toBe('2026-11-14T16:05:00Z');
    expect(pass.rows[0].checkedInAt).toBe('2026-11-14T16:05:00Z');
    expect(battle.rows[0].checkedInAt).toBe('2026-11-14T18:10:00Z');
    expect(workshop.rows.map((row) => row.checkedInAt)).toEqual([null, null]);
  });

  it('labels the status of each row', () => {
    const [event] = buildAttendeeLists(snapshot);
    expect(event.rows.map((row) => row.status)).toEqual(['Confirmada', 'Pendiente de pago']);
  });

  it('gives an event without registrations only the empty event list', () => {
    const lists = buildAttendeeLists({
      ...snapshot,
      passTypes: [],
      activities: [],
      registrations: [],
    });
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ id: 'event', title: 'Evento completo', rows: [] });
  });
});

describe('visibleLists', () => {
  const lists = buildAttendeeLists(snapshot);

  it('shows every list or only the chosen one', () => {
    expect(visibleLists(lists, allListsOption)).toBe(lists);
    expect(visibleLists(lists, lists[3].id).map((list) => list.title)).toEqual([
      'Competencia · Batalla 1vs1',
    ]);
  });

  it('falls back to every list when the choice is gone after a refresh', () => {
    expect(visibleLists(lists, 'pass:missing')).toBe(lists);
  });
});

describe('labels', () => {
  it('formats attendance with the check-in time or a dash', () => {
    expect(attendanceLabel('2026-11-14T15:05:00Z', zone)).toBe('Registrada 09:05');
    expect(attendanceLabel(null, zone)).toBe('—');
  });

  it('shows a dash for a missing folio', () => {
    expect(folioLabel(null)).toBe('—');
    expect(folioLabel('EB-7K3Q')).toBe('EB-7K3Q');
  });

  it('formats the generation time with date and time', () => {
    expect(formatGeneratedAt('2026-11-13T20:00:00Z', zone)).toBe('13 de noviembre de 2026, 14:00');
  });

  it('counts people', () => {
    expect(peopleCount(0)).toBe('0 personas');
    expect(peopleCount(1)).toBe('1 persona');
    expect(peopleCount(2)).toBe('2 personas');
  });
});
