import { describe, expect, it } from 'vitest';
import {
  eventDayKey,
  formatEventClock,
  formatEventDay,
  formatEventTime,
  fromZonedInput,
  toZonedInput,
} from './zoned-time';

// Every case names its time zone explicitly, so results never depend on the machine's zone.
const mexicoCity = 'America/Mexico_City';
const newYork = 'America/New_York';

// Mexico City is UTC-6 in November: this instant is Saturday 21 at 22:30 on the event's clock,
// but already Sunday 22 in UTC.
const lateSaturday = '2026-11-22T04:30:00.000Z';

describe('toZonedInput', () => {
  it('shows an instant as a datetime-local value on the event clock', () => {
    expect(toZonedInput(lateSaturday, mexicoCity)).toBe('2026-11-21T22:30');
    expect(toZonedInput('2026-11-21T15:00:00.000Z', 'Asia/Tokyo')).toBe('2026-11-22T00:00');
  });

  it('drops stored seconds, since the input only holds minutes', () => {
    expect(toZonedInput('2026-11-22T04:30:45.000Z', mexicoCity)).toBe('2026-11-21T22:30');
  });
});

describe('fromZonedInput', () => {
  it('reads an event-local wall-clock time as a UTC instant', () => {
    expect(fromZonedInput('2026-11-21T22:30', mexicoCity)).toBe(lateSaturday);
    expect(fromZonedInput('2026-11-22T00:00', 'Asia/Tokyo')).toBe('2026-11-21T15:00:00.000Z');
  });

  it('round-trips with toZonedInput', () => {
    for (const value of ['2026-11-21T22:30', '2026-01-01T00:00', '2026-07-15T13:05']) {
      const instant = fromZonedInput(value, mexicoCity);
      expect(instant).not.toBeNull();
      expect(toZonedInput(instant!, mexicoCity)).toBe(value);
    }
  });

  it('rejects a wall-clock time skipped by a DST change', () => {
    expect(fromZonedInput('2026-03-08T02:30', newYork)).toBeNull();
  });

  it('resolves a repeated wall-clock time to an instant that shows that time', () => {
    const instant = fromZonedInput('2026-11-01T01:30', newYork);
    expect(instant).not.toBeNull();
    expect(toZonedInput(instant!, newYork)).toBe('2026-11-01T01:30');
  });

  it.each(['', '2026-11-21 22:30', '2026-11-21T22:30:00', '21/11/2026 22:30'])(
    'rejects the malformed value %j',
    (value) => {
      expect(fromZonedInput(value, mexicoCity)).toBeNull();
    },
  );
});

describe('event clock formatting', () => {
  it('formats a full date and 24-hour time in Spanish', () => {
    expect(formatEventTime(lateSaturday, mexicoCity)).toBe('21 nov 2026, 22:30');
  });

  it('keys and labels the calendar day on the event clock, not in UTC', () => {
    expect(eventDayKey(lateSaturday, mexicoCity)).toBe('2026-11-21');
    expect(formatEventDay(lateSaturday, mexicoCity)).toBe('Sábado 21 de noviembre');
    expect(formatEventDay('2026-11-22T20:00:00.000Z', mexicoCity)).toBe('Domingo 22 de noviembre');
  });

  it('shows the wall-clock time as HH:mm', () => {
    expect(formatEventClock(lateSaturday, mexicoCity)).toBe('22:30');
    expect(formatEventClock('2026-11-22T06:00:00.000Z', mexicoCity)).toBe('00:00');
  });
});
