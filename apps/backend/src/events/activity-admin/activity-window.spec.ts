import { activityWindowErrors } from './activity-window';

const at = (iso: string) => new Date(iso);
const event = { startsAt: at('2026-11-21T00:00:00Z'), endsAt: at('2026-11-22T00:00:00Z') };
const draft = (startsAt: string, endsAt: string) => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
});

describe('activityWindowErrors', () => {
  it('accepts an activity inside the event window', () => {
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-21T10:00:00Z'), event),
    ).toEqual({});
  });

  it('accepts the exact event boundaries', () => {
    expect(
      activityWindowErrors(draft('2026-11-21T00:00:00Z', '2026-11-22T00:00:00Z'), event),
    ).toEqual({});
  });

  it('flags a start before the event start', () => {
    expect(
      activityWindowErrors(draft('2026-11-20T23:59:59Z', '2026-11-21T10:00:00Z'), event),
    ).toEqual({ startsAt: 'outside_event_window' });
  });

  it('flags an end after the event end', () => {
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-22T00:00:01Z'), event),
    ).toEqual({ endsAt: 'outside_event_window' });
  });

  it('flags both fields when each is outside the window', () => {
    expect(
      activityWindowErrors(draft('2026-11-20T09:00:00Z', '2026-11-23T09:00:00Z'), event),
    ).toEqual({ startsAt: 'outside_event_window', endsAt: 'outside_event_window' });
  });

  it('flags an end equal to or before the start with not_after_start', () => {
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-21T09:00:00Z'), event),
    ).toEqual({ endsAt: 'not_after_start' });
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-21T08:00:00Z'), event),
    ).toEqual({ endsAt: 'not_after_start' });
  });

  it('reports outside_event_window on the end when it is also not after the start', () => {
    expect(
      activityWindowErrors(draft('2026-11-23T09:00:00Z', '2026-11-22T09:00:00Z'), event),
    ).toEqual({ startsAt: 'outside_event_window', endsAt: 'outside_event_window' });
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-20T09:00:00Z'), event),
    ).toEqual({ endsAt: 'outside_event_window' });
  });

  it('only checks the order for an unbounded event', () => {
    expect(
      activityWindowErrors(draft('2001-01-01T00:00:00Z', '2099-01-01T00:00:00Z'), null),
    ).toEqual({});
    expect(
      activityWindowErrors(draft('2026-11-21T09:00:00Z', '2026-11-21T09:00:00Z'), null),
    ).toEqual({ endsAt: 'not_after_start' });
  });
});
