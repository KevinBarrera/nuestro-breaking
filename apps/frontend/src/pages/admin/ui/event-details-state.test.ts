import type { AdminEvent } from '@/entities/admin-event';
import { describe, expect, it } from 'vitest';
import {
  withDeleteBlockers,
  withEvent,
  withVenues,
  type DetailsState,
} from './event-details-state';

const event: AdminEvent = {
  id: 'a',
  name: 'Encuentro',
  slug: 'encuentro',
  folioPrefix: 'EB',
  archivedAt: null,
  timeZone: 'America/Mexico_City',
  startsAt: null,
  endsAt: null,
  salesEnabled: false,
};
const centro = { id: 'v1', name: 'Centro' };
const foro = { id: 'v2', name: 'Foro' };
const ready = (venues = [centro]): DetailsState => ({
  eventId: 'a',
  load: { status: 'ready', event, venues, deleteBlockers: [], saves: 0 },
});

describe('withEvent', () => {
  it('applies a saved event and keeps venues added meanwhile', () => {
    const added = withVenues(ready(), 'a', (venues) => [...venues, foro]);
    const saved = withEvent(added, { ...event, name: 'Encuentro 2026' });
    expect(saved.load).toEqual({
      status: 'ready',
      event: { ...event, name: 'Encuentro 2026' },
      venues: [centro, foro],
      deleteBlockers: [],
      saves: 1,
    });
  });

  it('ignores an answer for another event or while the event is loading', () => {
    const other: DetailsState = { eventId: 'b', load: { status: 'loading' } };
    expect(withEvent(other, event)).toBe(other);
    const loading: DetailsState = { eventId: 'a', load: { status: 'loading' } };
    expect(withEvent(loading, event)).toBe(loading);
  });
});

describe('withVenues', () => {
  it('updates the latest venues, so two answers both count', () => {
    const first = withVenues(ready(), 'a', (venues) => [...venues, foro]);
    const second = withVenues(first, 'a', (venues) =>
      venues.map((venue) => (venue.id === 'v1' ? { ...venue, name: 'Centro cultural' } : venue)),
    );
    expect(second.load.status === 'ready' && second.load.venues).toEqual([
      { id: 'v1', name: 'Centro cultural' },
      foro,
    ]);
  });

  it('ignores a venue answer for another event', () => {
    const state = ready();
    expect(withVenues(state, 'b', () => [])).toBe(state);
  });
});

describe('withDeleteBlockers', () => {
  it('records what a refused delete reported, only for the event shown', () => {
    const state = withDeleteBlockers(ready(), 'a', ['registrations']);
    expect(state.load.status === 'ready' && state.load.deleteBlockers).toEqual(['registrations']);
    const other = ready();
    expect(withDeleteBlockers(other, 'b', ['activities'])).toBe(other);
  });
});
