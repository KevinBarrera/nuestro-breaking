import type { CatalogActivity } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  activityDraft,
  checkTimes,
  draftWindow,
  durationLabel,
  editSummary,
  eventDayOptions,
  overlapNames,
  reviewWarning,
  scheduleLabel,
  type ActivityDraft,
} from './activity-form-model';

// Mexico City is UTC-6 in November. The event time zone is always passed explicitly, so results
// never depend on the machine time zone.
const timeZone = 'America/Mexico_City';
const eventWindow = { startsAt: '2026-11-21T15:00:00.000Z', endsAt: '2026-11-23T04:00:00.000Z' };

const activity = (overrides: Partial<CatalogActivity> = {}): CatalogActivity => ({
  id: 'toprock',
  eventId: 'event',
  venueId: 'studio',
  kind: 'competition',
  name: 'Breaking 1v1 Toprock',
  startsAt: '2026-11-21T16:00:00.000Z', // Saturday 10:00 local
  endsAt: '2026-11-21T17:00:00.000Z',
  status: 'active',
  version: 2,
  ...overrides,
});

const draft = (overrides: Partial<ActivityDraft> = {}): ActivityDraft => ({
  name: 'Locking 2v2',
  kind: 'competition',
  venueId: 'studio',
  day: '2026-11-22',
  start: '15:00',
  endsOtherDay: false,
  endDay: '2026-11-22',
  end: '16:00',
  ...overrides,
});

describe('eventDayOptions', () => {
  it('lists each event day on the event clock, from the first to the last', () => {
    expect(eventDayOptions(eventWindow, timeZone)).toEqual([
      { key: '2026-11-21', label: 'Sábado', sub: '21 de noviembre' },
      { key: '2026-11-22', label: 'Domingo', sub: '22 de noviembre' },
    ]);
  });

  it('lists a single day for a one-day event, and none without dates', () => {
    const oneDay = { startsAt: eventWindow.startsAt, endsAt: '2026-11-21T23:00:00.000Z' };
    expect(eventDayOptions(oneDay, timeZone).map((day) => day.key)).toEqual(['2026-11-21']);
    expect(eventDayOptions(null, timeZone)).toEqual([]);
  });

  it('crosses a month', () => {
    const window = { startsAt: '2026-11-30T15:00:00.000Z', endsAt: '2026-12-01T23:00:00.000Z' };
    expect(eventDayOptions(window, timeZone).map((day) => day.sub)).toEqual([
      '30 de noviembre',
      '1 de diciembre',
    ]);
  });
});

describe('activityDraft', () => {
  it('starts a new activity on the first event day with the first venue', () => {
    expect(activityDraft(undefined, timeZone, '2026-11-21', 'studio')).toEqual({
      name: '',
      kind: '',
      venueId: 'studio',
      day: '2026-11-21',
      start: '',
      endsOtherDay: false,
      endDay: '2026-11-21',
      end: '',
    });
  });

  it('reads a stored activity as day and times on the event clock', () => {
    expect(activityDraft(activity(), timeZone, '2026-11-21', 'other')).toEqual({
      name: 'Breaking 1v1 Toprock',
      kind: 'competition',
      venueId: 'studio',
      day: '2026-11-21',
      start: '10:00',
      endsOtherDay: false,
      endDay: '2026-11-21',
      end: '11:00',
    });
  });

  it('marks an activity that ends on a later day', () => {
    const nightly = activity({
      startsAt: '2026-11-22T04:00:00.000Z', // Saturday 22:00 local
      endsAt: '2026-11-22T07:00:00.000Z', // Sunday 01:00 local
    });
    expect(activityDraft(nightly, timeZone, '2026-11-21', 'studio')).toMatchObject({
      day: '2026-11-21',
      start: '22:00',
      endsOtherDay: true,
      endDay: '2026-11-22',
      end: '01:00',
    });
  });
});

describe('checkTimes and draftWindow', () => {
  it('combines the day and times on the event clock', () => {
    expect(draftWindow(draft(), timeZone)).toEqual({
      startsAt: '2026-11-22T21:00:00.000Z',
      endsAt: '2026-11-22T22:00:00.000Z',
    });
    expect(checkTimes(draft(), timeZone)).toEqual({ kind: 'ok', minutes: 60 });
  });

  it('ends on the same day unless "Termina otro día" is on', () => {
    const late = draft({ start: '22:00', end: '01:00', endDay: '2026-11-23' });
    expect(checkTimes(late, timeZone)).toEqual({ kind: 'order' });
    expect(checkTimes({ ...late, endsOtherDay: true }, timeZone)).toEqual({
      kind: 'ok',
      minutes: 180,
    });
    expect(draftWindow({ ...late, endsOtherDay: true }, timeZone)?.endsAt).toBe(
      '2026-11-23T07:00:00.000Z',
    );
  });

  it('rejects an end at or before the start', () => {
    expect(checkTimes(draft({ end: '15:00' }), timeZone)).toEqual({ kind: 'order' });
    expect(checkTimes(draft({ end: '14:55' }), timeZone)).toEqual({ kind: 'order' });
    expect(draftWindow(draft({ end: '14:55' }), timeZone)).toBeNull();
  });

  it('reports missing times or day', () => {
    expect(checkTimes(draft({ start: '' }), timeZone)).toEqual({ kind: 'missing' });
    expect(checkTimes(draft({ end: '' }), timeZone)).toEqual({ kind: 'missing' });
    expect(checkTimes(draft({ day: '' }), timeZone)).toEqual({ kind: 'missing' });
    expect(draftWindow(draft({ start: '' }), timeZone)).toBeNull();
  });
});

describe('durationLabel', () => {
  it.each([
    [60, 'Dura 1 h.'],
    [90, 'Dura 1 h 30 min.'],
    [45, 'Dura 45 min.'],
    [180, 'Dura 3 h.'],
  ])('reads %i minutes as %j', (minutes, label) => {
    expect(durationLabel(minutes)).toBe(label);
  });
});

describe('scheduleLabel', () => {
  it('names the day and the times on the event clock', () => {
    expect(scheduleLabel('2026-11-21T16:00:00.000Z', '2026-11-21T17:00:00.000Z', timeZone)).toBe(
      'Sáb 21 nov, 10:00–11:00',
    );
  });

  it('names both days when the activity ends on another day', () => {
    expect(scheduleLabel('2026-11-22T04:00:00.000Z', '2026-11-22T07:00:00.000Z', timeZone)).toBe(
      'Sáb 21 nov, 22:00 – Dom 22 nov, 01:00',
    );
  });
});

describe('overlapNames', () => {
  const rows = [
    activity(),
    activity({
      id: 'locking',
      name: 'Locking 3v3',
      startsAt: '2026-11-22T21:00:00.000Z',
      endsAt: '2026-11-22T22:00:00.000Z',
    }),
    activity({
      id: 'elsewhere',
      name: 'Otra sede',
      venueId: 'hall',
      startsAt: '2026-11-22T21:00:00.000Z',
      endsAt: '2026-11-22T22:00:00.000Z',
    }),
  ];

  it('names the active activities in the same venue that overlap, with their times', () => {
    expect(overlapNames(draft(), undefined, rows, timeZone)).toBe('Locking 3v3 (15:00–16:00)');
  });

  it('leaves out the activity being edited and anything without valid times', () => {
    expect(overlapNames(draft(), 'locking', rows, timeZone)).toBe('');
    expect(overlapNames(draft({ end: '' }), undefined, rows, timeZone)).toBe('');
  });

  it('joins several names with "y"', () => {
    const more = [...rows, { ...rows[1], id: 'popping', name: 'Popping 1v1' }];
    expect(overlapNames(draft(), undefined, more, timeZone)).toBe(
      'Locking 3v3 (15:00–16:00) y Popping 1v1 (15:00–16:00)',
    );
  });
});

describe('editSummary', () => {
  it('says how many are enrolled and which passes include the activity', () => {
    expect(editSummary(4, ['Pase completo Breaking', 'Golden ticket - breaking'])).toBe(
      '4 personas inscritas. Incluida en Pase completo Breaking, Golden ticket - breaking.',
    );
    expect(editSummary(1, ['Pase completo Breaking'])).toBe(
      '1 persona inscrita. Incluida en Pase completo Breaking.',
    );
    expect(editSummary(0, [])).toBe('Sin inscritos todavía. No está en ningún pase.');
  });

  it('leaves out the count when it is not known, and the passes when they are not', () => {
    expect(editSummary(undefined, ['Open Styles'])).toBe('Incluida en Open Styles.');
    expect(editSummary(2, null)).toBe('2 personas inscritas.');
    expect(editSummary(undefined, null)).toBe('');
  });
});

describe('reviewWarning', () => {
  const schedule = { key: 'schedule', label: 'Horario', before: 'a', after: 'b' };
  const venue = { key: 'venue', label: 'Sede', before: 'a', after: 'b' };
  const name = { key: 'name', label: 'Nombre', before: 'a', after: 'b' };

  it('warns the enrolled when the schedule or the venue changes', () => {
    expect(reviewWarning(4, [schedule])).toBe(
      '4 personas inscritas tenían el horario anterior. Avísales del cambio.',
    );
    expect(reviewWarning(1, [venue])).toBe(
      '1 persona inscrita tenía el horario anterior. Avísales del cambio.',
    );
  });

  it('says nothing for other changes, nobody enrolled or an unknown count', () => {
    expect(reviewWarning(4, [name])).toBeNull();
    expect(reviewWarning(0, [schedule])).toBeNull();
    expect(reviewWarning(undefined, [schedule])).toBeNull();
  });
});
