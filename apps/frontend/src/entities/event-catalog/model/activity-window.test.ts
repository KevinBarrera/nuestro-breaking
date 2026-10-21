import { describe, expect, it } from 'vitest';
import {
  activityWindowErrors,
  endInputMin,
  formatEventWindow,
  windowErrorMessages,
  windowInputBounds,
} from './activity-window';
import type { EventWindow } from '@/entities/event-catalog';

// Every case names its time zone explicitly, so results never depend on the machine's zone.
const mexicoCity = 'America/Mexico_City';
const tokyo = 'Asia/Tokyo';

// Mexico City is UTC-6 in November: Saturday 21 09:00 to Sunday 22 23:00 on the event's clock.
const eventWindow: EventWindow = {
  startsAt: '2026-11-21T15:00:00.000Z',
  endsAt: '2026-11-23T05:00:00.000Z',
};

describe('windowInputBounds', () => {
  it('shows the window as datetime-local limits on the event clock', () => {
    expect(windowInputBounds(eventWindow, mexicoCity)).toEqual({
      min: '2026-11-21T09:00',
      max: '2026-11-22T23:00',
    });
    expect(windowInputBounds(eventWindow, tokyo)).toEqual({
      min: '2026-11-22T00:00',
      max: '2026-11-23T14:00',
    });
  });

  it('rounds seconds inwards so a limit never offers an instant outside the window', () => {
    const bounds = windowInputBounds(
      { startsAt: '2026-11-21T15:00:01.000Z', endsAt: '2026-11-23T04:59:59.999Z' },
      mexicoCity,
    );
    expect(bounds).toEqual({ min: '2026-11-21T09:01', max: '2026-11-22T22:59' });
  });

  it('keeps limits that already sit on a whole minute', () => {
    const bounds = windowInputBounds(
      { startsAt: '2026-11-21T15:30:00.000Z', endsAt: '2026-11-21T16:45:00.000Z' },
      mexicoCity,
    );
    expect(bounds).toEqual({ min: '2026-11-21T09:30', max: '2026-11-21T10:45' });
  });
});

describe('endInputMin', () => {
  const bounds = windowInputBounds(eventWindow, mexicoCity);

  it('uses the event start until an "Inicio" is chosen', () => {
    expect(endInputMin(bounds, '')).toBe('2026-11-21T09:00');
    expect(endInputMin(bounds, 'garbage')).toBe('2026-11-21T09:00');
  });

  it('follows a chosen "Inicio" inside the window', () => {
    expect(endInputMin(bounds, '2026-11-21T12:30')).toBe('2026-11-21T12:30');
  });

  it('never goes below the event start when "Inicio" is earlier', () => {
    expect(endInputMin(bounds, '2026-11-20T08:00')).toBe('2026-11-21T09:00');
  });
});

describe('activityWindowErrors', () => {
  const draft = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });

  it('accepts values inside the window', () => {
    expect(
      activityWindowErrors(
        draft('2026-11-21T16:00:00.000Z', '2026-11-21T18:00:00.000Z'),
        eventWindow,
      ),
    ).toEqual({});
  });

  it('allows the exact event bounds and rejects one millisecond beyond them', () => {
    expect(
      activityWindowErrors(draft(eventWindow.startsAt, eventWindow.endsAt), eventWindow),
    ).toEqual({});
    expect(
      activityWindowErrors(
        draft('2026-11-21T14:59:59.999Z', '2026-11-23T05:00:00.001Z'),
        eventWindow,
      ),
    ).toEqual({ startsAt: 'outside_event_window', endsAt: 'outside_event_window' });
  });

  it('marks only the field that is outside the window', () => {
    expect(
      activityWindowErrors(
        draft('2026-11-21T10:00:00.000Z', '2026-11-21T18:00:00.000Z'),
        eventWindow,
      ),
    ).toEqual({ startsAt: 'outside_event_window' });
    expect(
      activityWindowErrors(
        draft('2026-11-21T16:00:00.000Z', '2026-11-24T00:00:00.000Z'),
        eventWindow,
      ),
    ).toEqual({ endsAt: 'outside_event_window' });
  });

  it('marks "Fin" when it is not strictly after "Inicio"', () => {
    const at = '2026-11-21T16:00:00.000Z';
    expect(activityWindowErrors(draft(at, at), eventWindow)).toEqual({ endsAt: 'not_after_start' });
    expect(activityWindowErrors(draft(at, '2026-11-21T15:59:00.000Z'), eventWindow)).toEqual({
      endsAt: 'not_after_start',
    });
  });

  it('prefers outside_event_window over not_after_start on "Fin"', () => {
    expect(
      activityWindowErrors(
        draft('2026-11-23T04:00:00.000Z', '2026-11-20T00:00:00.000Z'),
        eventWindow,
      ),
    ).toEqual({ endsAt: 'outside_event_window' });
  });

  it('still reports an unordered pair on an unbounded event, and nothing else', () => {
    expect(
      activityWindowErrors(draft('2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z'), null),
    ).toEqual({});
    expect(
      activityWindowErrors(draft('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), null),
    ).toEqual({ endsAt: 'not_after_start' });
  });
});

describe('windowErrorMessages', () => {
  it('words each failing field', () => {
    expect(
      windowErrorMessages({ startsAt: 'outside_event_window', endsAt: 'outside_event_window' }),
    ).toEqual({
      startsAt: 'El inicio debe estar dentro de las fechas del evento.',
      endsAt: 'El fin debe estar dentro de las fechas del evento.',
    });
    expect(windowErrorMessages({ endsAt: 'not_after_start' })).toEqual({
      endsAt: 'El fin debe ser posterior al inicio.',
    });
  });

  it('leaves a field without an error out', () => {
    expect(windowErrorMessages({})).toEqual({});
  });

  it('ignores a code that does not apply to the field', () => {
    expect(windowErrorMessages({ startsAt: 'not_after_start' })).toEqual({});
  });
});

describe('formatEventWindow', () => {
  it('names the first and last day of the event', () => {
    expect(formatEventWindow(eventWindow, mexicoCity)).toBe(
      'El evento va del 21 al 22 de noviembre de 2026.',
    );
  });

  it('reads the days on the event clock, not in UTC', () => {
    // 05:00Z is still the 22nd in Mexico City but already the 23rd in UTC.
    expect(
      formatEventWindow({ ...eventWindow, endsAt: '2026-11-23T05:00:00.000Z' }, mexicoCity),
    ).toBe('El evento va del 21 al 22 de noviembre de 2026.');
    expect(formatEventWindow(eventWindow, tokyo)).toBe(
      'El evento va del 22 al 23 de noviembre de 2026.',
    );
  });

  it('names one day when the event starts and ends the same day', () => {
    expect(
      formatEventWindow(
        { startsAt: '2026-11-21T15:00:00.000Z', endsAt: '2026-11-22T03:00:00.000Z' },
        mexicoCity,
      ),
    ).toBe('El evento es el 21 de noviembre de 2026.');
  });

  it('repeats the month when the event crosses months', () => {
    expect(
      formatEventWindow(
        { startsAt: '2026-11-30T15:00:00.000Z', endsAt: '2026-12-02T15:00:00.000Z' },
        mexicoCity,
      ),
    ).toBe('El evento va del 30 de noviembre al 2 de diciembre de 2026.');
  });

  it('repeats the year when the event crosses years', () => {
    expect(
      formatEventWindow(
        { startsAt: '2026-12-30T15:00:00.000Z', endsAt: '2027-01-02T15:00:00.000Z' },
        mexicoCity,
      ),
    ).toBe('El evento va del 30 de diciembre de 2026 al 2 de enero de 2027.');
  });
});
