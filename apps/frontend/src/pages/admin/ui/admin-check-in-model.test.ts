import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  admissionNotice,
  canAdmit,
  checkInPlan,
  escalationMessage,
  formatCheckInTime,
  readAdmission,
  readCheckInPage,
  recordedAt,
  type CheckInActivity,
  type CheckInRow,
} from './admin-check-in-model';

const eventId = 'event-1';
const workshop: CheckInActivity = {
  id: 'a-2',
  name: 'Taller de footwork',
  kind: 'workshop',
  checkedInAt: null,
};
const battle: CheckInActivity = {
  id: 'a-1',
  name: 'Batalla 1vs1',
  kind: 'competition',
  checkedInAt: null,
};
const row = (
  overrides: Partial<CheckInRow['registration']> = {},
  activities = [workshop, battle],
) =>
  ({
    participant: { id: 'p-1', fullName: 'Luz Rivera', email: null, stageName: 'Luz' },
    registration: {
      id: 'r-1',
      eventId,
      folio: 'NB-42',
      status: 'confirmed',
      checkedInAt: null,
      generalEntryOnly: false,
      ...overrides,
    },
    activities,
  }) satisfies CheckInRow;
const page = (results: unknown[]) => ({ total: results.length, limit: 20, offset: 0, results });

describe('readCheckInPage', () => {
  it('reads rows of the current event with their general-only flag', () => {
    expect(readCheckInPage(page([row()]), eventId)).toEqual({ total: 1, results: [row()] });
    expect(
      readCheckInPage(
        page([row({ generalEntryOnly: true, checkedInAt: '2026-11-14T09:00:00Z' })]),
        eventId,
      )?.results[0].registration.generalEntryOnly,
    ).toBe(true);
  });

  it('rejects the whole page when any row is malformed or belongs to another event', () => {
    const withoutFlag: Partial<CheckInRow['registration']> = { ...row().registration };
    delete withoutFlag.generalEntryOnly;
    for (const bad of [
      { ...row(), registration: withoutFlag },
      { ...row(), registration: { ...row().registration, generalEntryOnly: 'false' } },
      { ...row(), registration: { ...row().registration, eventId: 'other' } },
      { ...row(), registration: { ...row().registration, checkedInAt: 'today' } },
      { ...row(), activities: [{ ...battle, checkedInAt: 'soon' }] },
      { ...row(), activities: [{ id: 'a-1', name: 'Batalla' }] },
      { ...row(), activities: null },
      { ...row(), participant: null },
    ]) {
      expect(readCheckInPage(page([row(), bad]), eventId)).toBeNull();
    }
    expect(readCheckInPage({ results: [] }, eventId)).toBeNull();
    expect(readCheckInPage({ total: 1.5, results: [] }, eventId)).toBeNull();
    expect(readCheckInPage(null, eventId)).toBeNull();
  });
});

describe('checkInPlan', () => {
  it('offers one action per eligible activity, sorted by name, without an event action', () => {
    const social = { id: 'a-0', name: 'Fiesta', kind: 'social', checkedInAt: null };
    expect(checkInPlan(row({}, [workshop, social, battle]))).toEqual({
      escalate: false,
      event: null,
      activities: [battle, workshop],
    });
  });

  it('breaks name ties by id and ignores case and accents', () => {
    const first = { ...workshop, id: 'a-1', name: 'árbol' };
    const second = { ...workshop, id: 'a-9', name: 'Arbol' };
    const third = { ...workshop, id: 'a-5', name: 'Bboy' };
    expect(checkInPlan(row({}, [third, second, first])).activities).toEqual([first, second, third]);
  });

  it('offers the event action only for general-entry-only registrations', () => {
    expect(checkInPlan(row({ generalEntryOnly: true }, []))).toEqual({
      escalate: false,
      event: { checkedInAt: null },
      activities: [],
    });
    expect(checkInPlan(row({ checkedInAt: '2026-11-14T09:00:00Z' })).event).toBeNull();
  });

  it('escalates when nothing can be checked in or the registration is not confirmed', () => {
    expect(checkInPlan(row({}, []))).toEqual({ escalate: true, event: null, activities: [] });
    const social = { id: 'a-0', name: 'Fiesta', kind: 'social', checkedInAt: null };
    expect(checkInPlan(row({}, [social])).escalate).toBe(true);
    for (const status of ['pending_payment', 'voided']) {
      expect(checkInPlan(row({ status }))).toEqual({ escalate: true, event: null, activities: [] });
      expect(checkInPlan(row({ status, generalEntryOnly: true }, []))).toEqual({
        escalate: true,
        event: null,
        activities: [],
      });
    }
  });
});

describe('canAdmit', () => {
  it('allows only listed, pending targets of the plan', () => {
    expect(canAdmit(row(), { kind: 'activity', activity: battle })).toBe(true);
    expect(canAdmit(row(), { kind: 'event' })).toBe(false);
    expect(canAdmit(row({ generalEntryOnly: true }, []), { kind: 'event' })).toBe(true);
    const done = { ...battle, checkedInAt: '2026-11-14T09:30:00Z' };
    expect(canAdmit(row({}, [done]), { kind: 'activity', activity: battle })).toBe(false);
    expect(
      canAdmit(row({ generalEntryOnly: true, checkedInAt: '2026-11-14T09:00:00Z' }, []), {
        kind: 'event',
      }),
    ).toBe(false);
    const unlisted = { ...battle, id: 'a-404' };
    expect(canAdmit(row(), { kind: 'activity', activity: unlisted })).toBe(false);
    expect(
      canAdmit(row({ status: 'pending_payment' }), { kind: 'activity', activity: battle }),
    ).toBe(false);
  });
});

describe('readAdmission', () => {
  const expected = { eventId, registrationId: 'r-1', activityId: 'a-1' };
  const fact = {
    id: 'fact',
    eventId,
    registrationId: 'r-1',
    activityId: 'a-1',
    checkedInAt: '2026-11-14T09:30:00Z',
    alreadyCheckedIn: false,
  };

  it('reads a new or repeated fact for the requested target', () => {
    expect(readAdmission(fact, expected)).toEqual({
      checkedInAt: '2026-11-14T09:30:00Z',
      alreadyCheckedIn: false,
    });
    expect(readAdmission({ ...fact, alreadyCheckedIn: true }, expected)?.alreadyCheckedIn).toBe(
      true,
    );
    const eventFact: Partial<typeof fact> = { ...fact };
    delete eventFact.activityId;
    expect(readAdmission(eventFact, { eventId, registrationId: 'r-1' })).not.toBeNull();
  });

  it('rejects a fact for another target or without a valid time or flag', () => {
    for (const bad of [
      { ...fact, activityId: 'a-2' },
      { ...fact, registrationId: 'r-2' },
      { ...fact, eventId: 'other' },
      { ...fact, checkedInAt: null },
      { ...fact, checkedInAt: 'now' },
      { ...fact, alreadyCheckedIn: 'no' },
      null,
    ]) {
      expect(readAdmission(bad, expected)).toBeNull();
    }
  });
});

describe('recordedAt', () => {
  it('reads the refreshed check-in time of the target', () => {
    const done = { ...battle, checkedInAt: '2026-11-14T09:30:00Z' };
    expect(recordedAt(row({}, [done]), { kind: 'activity', activity: battle })).toBe(
      '2026-11-14T09:30:00Z',
    );
    expect(recordedAt(row(), { kind: 'activity', activity: battle })).toBeNull();
    expect(recordedAt(row({ checkedInAt: '2026-11-14T09:00:00Z' }), { kind: 'event' })).toBe(
      '2026-11-14T09:00:00Z',
    );
  });
});

describe('copy', () => {
  const zone = 'America/Mexico_City';

  it('formats check-in times as 24-hour clock times in the given zone', () => {
    expect(formatCheckInTime('2026-11-14T15:05:00Z', zone)).toBe('09:05');
  });

  it('names each action', () => {
    expect(actionLabel({ kind: 'event' })).toBe('Registrar entrada al evento');
    expect(actionLabel({ kind: 'activity', activity: battle })).toBe(
      'Registrar entrada a Batalla 1vs1',
    );
  });

  it('announces success only when the refreshed projection shows the fact', () => {
    const target = { kind: 'activity', activity: battle } as const;
    const at = '2026-11-14T15:30:00Z';
    expect(admissionNotice({ kind: 'recorded', checkedInAt: at }, target, at, zone)).toEqual({
      kind: 'success',
      text: 'Entrada a Batalla 1vs1 registrada',
    });
    expect(
      admissionNotice({ kind: 'recorded', checkedInAt: at }, { kind: 'event' }, at, zone),
    ).toEqual({ kind: 'success', text: 'Entrada al evento registrada' });
    expect(admissionNotice({ kind: 'recorded', checkedInAt: at }, target, null, zone).kind).toBe(
      'error',
    );
  });

  it('reports a repeat as already registered with the first time', () => {
    const target = { kind: 'activity', activity: battle } as const;
    expect(
      admissionNotice(
        { kind: 'repeat', checkedInAt: '2026-11-14T15:30:00Z' },
        target,
        '2026-11-14T15:30:00Z',
        zone,
      ),
    ).toEqual({ kind: 'already', text: 'Esta entrada ya estaba registrada a las 09:30.' });
  });

  it('sends rejected check-ins to coordination and keeps other failures generic', () => {
    const target = { kind: 'event' } as const;
    expect(admissionNotice({ kind: 'rejected' }, target, null, zone)).toEqual({
      kind: 'escalate',
      text: escalationMessage,
    });
    expect(escalationMessage).toMatch(/coordinación general/);
    expect(admissionNotice({ kind: 'denied' }, target, null, zone)).toEqual({
      kind: 'error',
      text: 'Acceso denegado para registrar esta entrada. Consulta al responsable.',
    });
    expect(admissionNotice({ kind: 'error' }, target, '2026-11-14T15:30:00Z', zone)).toEqual({
      kind: 'error',
      text: 'No se pudo registrar la entrada. Consulta al responsable antes de continuar.',
    });
  });
});
