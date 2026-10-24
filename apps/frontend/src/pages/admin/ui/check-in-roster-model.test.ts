import { describe, expect, it } from 'vitest';
import type { AttendeeLists } from '@/entities/attendee-list';
import {
  activityOptions,
  buildRoster,
  initials,
  matchesQuery,
  progress,
  progressLabel,
  rowStatus,
  statusCounts,
  visibleRoster,
  type RosterPerson,
} from './check-in-roster-model';

const at = '2026-11-21T17:50:00.000Z';
const lists: AttendeeLists = {
  event: { id: 'e-1', name: 'Nuestro Breaking' },
  generatedAt: at,
  passTypes: [
    { id: 'general', name: 'Entrada general', passClass: 'general', archived: false },
    { id: 'full', name: 'Pase completo Breaking', passClass: 'full', archived: false },
    { id: 'kids', name: 'Breaking Kids', passClass: 'add_on', archived: false },
  ],
  activities: [
    { id: 'a-bboy', name: 'Breaking Bboy', kind: 'competition', startsAt: at },
    { id: 'a-foot', name: 'Breaking Footwork', kind: 'workshop', startsAt: at },
  ],
  registrations: [
    {
      registrationId: 'r-tonny',
      folio: 'EV-6DSB',
      fullName: 'Tonny Presidio',
      stageName: 'Tonnpresssss',
      status: 'confirmed',
      eventCheckedInAt: null,
      passTypeIds: ['full', 'kids'],
      activities: [
        { activityId: 'a-foot', checkedInAt: null },
        { activityId: 'a-bboy', checkedInAt: at },
      ],
    },
    {
      registrationId: 'r-mau',
      folio: 'EV-PE4M',
      fullName: 'Mau Aczino',
      stageName: 'Aczino',
      status: 'confirmed',
      eventCheckedInAt: null,
      passTypeIds: ['general'],
      activities: [],
    },
    {
      registrationId: 'r-ale',
      folio: 'EV-P8TA',
      fullName: 'Ále Ferman',
      stageName: null,
      status: 'confirmed',
      eventCheckedInAt: at,
      passTypeIds: ['general'],
      activities: [],
    },
    {
      registrationId: 'r-dani',
      folio: null,
      fullName: 'Dani Ruiz',
      stageName: 'Dani R',
      status: 'pending_payment',
      eventCheckedInAt: null,
      passTypeIds: ['general'],
      activities: [],
    },
    {
      registrationId: 'r-none',
      folio: 'EV-0000',
      fullName: 'Sin Pases',
      stageName: null,
      status: 'confirmed',
      eventCheckedInAt: null,
      passTypeIds: [],
      activities: [],
    },
  ],
};
const roster = buildRoster(lists);
const person = (id: string) => roster.find((p) => p.registrationId === id) as RosterPerson;

describe('buildRoster', () => {
  it('gives general-entry-only registrations the event entry and the rest their activities by name', () => {
    expect(person('r-mau').checks).toEqual([
      { activityId: null, name: 'Entrada al evento', checkedInAt: null },
    ]);
    expect(person('r-tonny')).toMatchObject({
      confirmed: true,
      generalEntryOnly: false,
      pass: 'Pase completo Breaking, Breaking Kids',
      checks: [
        { activityId: 'a-bboy', name: 'Breaking Bboy', checkedInAt: at },
        { activityId: 'a-foot', name: 'Breaking Footwork', checkedInAt: null },
      ],
    });
    expect(person('r-none')).toMatchObject({ pass: 'Sin pase', checks: [] });
    expect(person('r-dani').confirmed).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('matches name and alias without accents or case', () => {
    expect(matchesQuery(person('r-ale'), 'ale fer')).toBe(true);
    expect(matchesQuery(person('r-tonny'), 'TONNP')).toBe(true);
    expect(matchesQuery(person('r-mau'), 'tonny')).toBe(false);
  });

  it('matches the folio with or without the hyphen', () => {
    expect(matchesQuery(person('r-tonny'), 'ev6dsb')).toBe(true);
    expect(matchesQuery(person('r-tonny'), 'EV-6D')).toBe(true);
    expect(matchesQuery(person('r-dani'), '-')).toBe(false);
  });
});

describe('statusCounts and progress', () => {
  it('counts every registration for all activities, done only when every check is in', () => {
    expect(statusCounts(roster, 'all')).toEqual({ pending: 4, done: 1, all: 5 });
    expect(progress(roster, 'all')).toEqual({ registered: 2, total: 4 });
  });

  it('narrows counts and progress to the chosen activity and leaves out pending payments', () => {
    expect(statusCounts(roster, 'event')).toEqual({ pending: 2, done: 1, all: 3 });
    expect(progress(roster, 'event')).toEqual({ registered: 1, total: 2 });
    expect(statusCounts(roster, 'a-bboy')).toEqual({ pending: 0, done: 1, all: 1 });
  });
});

describe('visibleRoster', () => {
  it('filters by status sorted by name, and ignores the status while searching', () => {
    const names = (list: RosterPerson[]) => list.map((p) => p.fullName);
    expect(names(visibleRoster(roster, { query: '', status: 'pending', activity: 'all' }))).toEqual(
      ['Dani Ruiz', 'Mau Aczino', 'Sin Pases', 'Tonny Presidio'],
    );
    expect(names(visibleRoster(roster, { query: '', status: 'done', activity: 'all' }))).toEqual([
      'Ále Ferman',
    ]);
    expect(
      names(visibleRoster(roster, { query: 'ale', status: 'pending', activity: 'all' })),
    ).toEqual(['Ále Ferman']);
    expect(names(visibleRoster(roster, { query: '', status: 'all', activity: 'a-foot' }))).toEqual([
      'Tonny Presidio',
    ]);
  });
});

describe('rowStatus', () => {
  it('describes each case with its tone', () => {
    const utc = 'UTC';
    expect(rowStatus(person('r-dani'), 'all', utc)).toEqual({
      text: 'Pago por revisar',
      tone: 'warning',
    });
    expect(rowStatus(person('r-mau'), 'all', utc)).toEqual({ text: 'Por entrar', tone: 'neutral' });
    expect(rowStatus(person('r-ale'), 'all', utc)).toEqual({
      text: 'Entró 17:50',
      tone: 'success',
    });
    expect(rowStatus(person('r-tonny'), 'all', utc)).toEqual({
      text: '1 de 2 actividades',
      tone: 'neutral',
    });
    expect(rowStatus(person('r-tonny'), 'a-bboy', utc)).toEqual({
      text: 'Entró 17:50',
      tone: 'success',
    });
    expect(rowStatus(person('r-none'), 'all', utc)).toEqual({
      text: 'Consultar coordinación',
      tone: 'warning',
    });
  });

  it('says Completo when every activity is in', () => {
    const done = {
      ...person('r-tonny'),
      checks: person('r-tonny').checks.map((c) => ({ ...c, checkedInAt: at })),
    };
    expect(rowStatus(done, 'all')).toEqual({ text: 'Completo', tone: 'success' });
  });
});

describe('labels', () => {
  it('lists the event entry first and activities by name', () => {
    expect(activityOptions(roster)).toEqual([
      { id: 'all', label: 'Todas las actividades' },
      { id: 'event', label: 'Entrada al evento (pase general)' },
      { id: 'a-bboy', label: 'Breaking Bboy' },
      { id: 'a-foot', label: 'Breaking Footwork' },
    ]);
  });

  it('names the progress after the activity', () => {
    expect(progressLabel(roster, 'all')).toBe('Entradas registradas');
    expect(progressLabel(roster, 'event')).toBe('Entradas al evento');
    expect(progressLabel(roster, 'a-foot')).toBe('Entradas a Breaking Footwork');
  });

  it('takes up to two initials', () => {
    expect(initials('Tonny Presidio')).toBe('TP');
    expect(initials('  álvaro  ')).toBe('Á');
  });
});
