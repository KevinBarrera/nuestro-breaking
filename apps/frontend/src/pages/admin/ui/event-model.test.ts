import type { AdminEventFailure, AdminEventSummary } from '@/entities/admin-event';
import { describe, expect, it } from 'vitest';
import {
  eventFailureMessage,
  folioPattern,
  landingRedirect,
  restoredNotice,
  splitEvents,
} from './event-model';

const event = (id: string, archivedAt: string | null = null): AdminEventSummary => ({
  id,
  name: `Evento ${id}`,
  slug: `evento-${id}`,
  folioPrefix: 'EV',
  archivedAt,
});

describe('splitEvents', () => {
  it('separates active and archived events, keeping the order', () => {
    const list = [event('a'), event('b', '2026-10-01T10:00:00.000Z'), event('c')];
    expect(splitEvents(list)).toEqual({ active: [list[0], list[2]], archived: [list[1]] });
  });
});

describe('landingRedirect', () => {
  it('opens the only active event for accounts that cannot create events', () => {
    expect(landingRedirect([event('a')], false)).toBe('a');
    expect(landingRedirect([event('a'), event('b')], false)).toBeNull();
    expect(landingRedirect([], false)).toBeNull();
  });

  it('never redirects a global admin, who needs the list to create and restore', () => {
    expect(landingRedirect([event('a')], true)).toBeNull();
  });
});

describe('folioPattern', () => {
  it('shows the prefix with a hidden code', () => {
    expect(folioPattern('LMP')).toBe('LMP-····');
  });
});

describe('restoredNotice', () => {
  it('names the event and says sales stay closed', () => {
    expect(restoredNotice('Batalla')).toContain('«Batalla»');
    expect(restoredNotice('Batalla')).toContain('venta en línea sigue cerrada');
  });
});

describe('eventFailureMessage', () => {
  it('has Spanish copy for every failure kind', () => {
    const failures: AdminEventFailure[] = [
      { kind: 'unauthorized' },
      { kind: 'forbidden' },
      { kind: 'invalid', fieldErrors: {} },
      { kind: 'rule', code: 'slug_taken' },
      { kind: 'rule', code: 'organization_ambiguous' },
      { kind: 'rule', code: 'event_archived' },
      { kind: 'rule', code: 'event_not_archived' },
      { kind: 'rule', code: 'venue_shared' },
      { kind: 'not_empty', blockers: ['activities'] },
      { kind: 'not_found' },
      { kind: 'unknown' },
      { kind: 'error' },
    ];
    for (const failure of failures) expect(eventFailureMessage(failure)).toMatch(/\S/);
    expect(eventFailureMessage({ kind: 'unauthorized' })).toBe(
      eventFailureMessage({ kind: 'forbidden' }),
    );
  });
});
