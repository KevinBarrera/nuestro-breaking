import type { AttendeeLists, AttendeeListRegistration } from '@/entities/attendee-list';
import { describe, expect, it } from 'vitest';
import {
  buildAttendeeLists,
  entryLabel,
  folioLabel,
  formatGeneratedAt,
  freshness,
  groupAttendeeLists,
  keptSelection,
  listKindLabel,
  listProgress,
  peopleCount,
  printLabel,
  searchList,
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
    person('r2', 'Beto Ruiz', {
      status: 'pending_payment',
      passTypeIds: ['full', 'old'],
      activities: [{ activityId: 'class', checkedInAt: null }],
    }),
    person('r1', 'Ángela López', {
      folio: 'EB-7K3Q',
      stageName: 'Flash',
      eventCheckedInAt: '2026-11-14T16:05:00Z',
      passTypeIds: ['full'],
      activities: [
        { activityId: 'battle', checkedInAt: '2026-11-14T18:10:00Z' },
        { activityId: 'class', checkedInAt: null },
      ],
    }),
  ],
};

const lists = buildAttendeeLists(snapshot);

describe('buildAttendeeLists', () => {
  it('orders the event list, then one list per pass type and per activity', () => {
    expect(lists.map((list) => [list.group, list.title])).toEqual([
      ['event', 'Evento completo'],
      ['pass', 'Pase completo'],
      ['pass', 'Pase preventa (archivado)'],
      ['competition', 'Batalla 1vs1'],
      ['workshop', 'Clase de toprock'],
    ]);
  });

  it('puts each person on the lists of what they hold, in alphabetical order', () => {
    expect(lists.map((list) => list.rows.map((row) => row.fullName))).toEqual([
      ['Ángela López', 'Beto Ruiz'],
      ['Ángela López', 'Beto Ruiz'],
      ['Beto Ruiz'],
      ['Ángela López'],
      ['Ángela López', 'Beto Ruiz'],
    ]);
  });

  it('shows the passes only on the event list', () => {
    const [event, pass] = lists;
    expect(event.showPasses).toBe(true);
    expect(event.rows.map((row) => row.passes)).toEqual([
      ['Pase completo'],
      ['Pase completo', 'Pase preventa'],
    ]);
    expect(pass.showPasses).toBe(false);
  });

  it('uses event attendance on event and pass lists and the activity check-in on activity lists', () => {
    const [event, pass, , battle, workshop] = lists;
    expect(event.rows[0].checkedInAt).toBe('2026-11-14T16:05:00Z');
    expect(pass.rows[0].checkedInAt).toBe('2026-11-14T16:05:00Z');
    expect(battle.rows[0].checkedInAt).toBe('2026-11-14T18:10:00Z');
    expect(workshop.rows.map((row) => row.checkedInAt)).toEqual([null, null]);
  });

  it('marks the rows still pending payment', () => {
    expect(lists[0].rows.map((row) => row.pending)).toEqual([false, true]);
  });

  it('gives an event without registrations only the empty event list', () => {
    const empty = buildAttendeeLists({
      ...snapshot,
      passTypes: [],
      activities: [],
      registrations: [],
    });
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ id: 'event', title: 'Evento completo', rows: [] });
  });
});

describe('groupAttendeeLists', () => {
  it('groups the lists by kind, with a count when a group has more than one', () => {
    expect(
      groupAttendeeLists(lists).map((group) => [group.label, group.lists.map((list) => list.id)]),
    ).toEqual([
      ['Evento', ['event']],
      ['Pases · 2', ['pass:full', 'pass:old']],
      ['Competencias', ['activity:battle']],
      ['Talleres', ['activity:class']],
    ]);
  });

  it('leaves out the groups without lists', () => {
    expect(groupAttendeeLists(lists.slice(0, 1)).map((group) => group.label)).toEqual(['Evento']);
  });
});

describe('selection', () => {
  it('keeps only the lists that still exist after a refresh', () => {
    expect(keptSelection(['event', 'pass:gone', 'activity:battle'], lists)).toEqual([
      'event',
      'activity:battle',
    ]);
  });

  it('names the print action by the number of checked lists', () => {
    expect(printLabel(0)).toBe('Elige una lista para imprimir');
    expect(printLabel(1)).toBe('Imprimir 1 lista');
    expect(printLabel(3)).toBe('Imprimir 3 listas');
  });
});

describe('freshness', () => {
  const at = '2026-10-23T21:24:00Z';
  const later = (minutes: number) => new Date(Date.parse(at) + minutes * 60_000);

  it('says the data is current for under 30 minutes', () => {
    expect(freshness(at, later(29), zone)).toEqual({
      tone: 'success',
      title: 'Datos al día',
      text: 'Al 23 de octubre de 2026, 15:24. Imprime ahora para llevar la versión más reciente.',
    });
  });

  it('warns with the age after that', () => {
    const stale = freshness(at, later(30), zone);
    expect(stale.tone).toBe('warning');
    expect(stale.title).toBe('Datos de hace 30 minutos');
    expect(stale.text).toBe(
      'Al 23 de octubre de 2026, 15:24. Actualiza antes de imprimir para incluir las inscripciones y entradas más recientes.',
    );
    expect(freshness(at, later(60), zone).title).toBe('Datos de hace 1 hora');
    expect(freshness(at, later(185), zone).title).toBe('Datos de hace 3 horas');
    expect(freshness(at, later(60 * 26), zone).title).toBe('Datos de hace 1 día');
    expect(freshness(at, later(60 * 50), zone).title).toBe('Datos de hace 2 días');
  });
});

describe('preview', () => {
  it('names the kind, saying activity entries count per activity', () => {
    expect(lists.map(listKindLabel)).toEqual([
      'Evento',
      'Pase',
      'Pase',
      'Competencia · la entrada se cuenta por competencia',
      'Taller · la entrada se cuenta por taller',
    ]);
  });

  it('measures who already entered', () => {
    expect(listProgress(lists[0])).toEqual({
      entered: 1,
      total: 2,
      percent: 50,
      label: '1 de 2 personas ya entraron · 1 por entrar',
    });
    expect(listProgress(lists[3]).label).toBe('1 de 1 persona ya entró · 0 por entrar');
    expect(listProgress({ ...lists[0], rows: [] }).percent).toBe(0);
  });

  it('searches by name or AKA without accents, and by folio with or without hyphen', () => {
    const names = (query: string) => searchList(lists[0], query).map((row) => row.fullName);
    expect(names('')).toEqual(['Ángela López', 'Beto Ruiz']);
    expect(names('angela')).toEqual(['Ángela López']);
    expect(names('FLASH')).toEqual(['Ángela López']);
    expect(names('eb7k')).toEqual(['Ángela López']);
    expect(names('nadie')).toEqual([]);
  });

  it('labels the entry with the check-in time', () => {
    expect(entryLabel('2026-11-14T15:05:00Z', zone)).toBe('Entró 09:05');
    expect(entryLabel(null, zone)).toBe('Sin entrar');
  });
});

describe('labels', () => {
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
