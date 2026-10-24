import { describe, expect, it } from 'vitest';
import {
  admissionNotice,
  escalationMessage,
  formatCheckInTime,
  readAdmission,
} from './admin-check-in-model';

const eventId = 'event-1';
const eventEntry = { activityId: null, name: 'Entrada al evento' };

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

describe('copy', () => {
  const zone = 'America/Mexico_City';

  it('formats check-in times as 24-hour clock times in the given zone', () => {
    expect(formatCheckInTime('2026-11-14T15:05:00Z', zone)).toBe('09:05');
  });

  it('announces success only when the refreshed projection shows the fact', () => {
    const target = { activityId: 'a-1', name: 'Batalla 1vs1' };
    const at = '2026-11-14T15:30:00Z';
    expect(admissionNotice({ kind: 'recorded', checkedInAt: at }, target, at, zone)).toEqual({
      kind: 'success',
      text: 'Entrada a Batalla 1vs1 registrada a las 09:30.',
    });
    expect(admissionNotice({ kind: 'recorded', checkedInAt: at }, eventEntry, at, zone)).toEqual({
      kind: 'success',
      text: 'Entrada al evento registrada a las 09:30.',
    });
    expect(admissionNotice({ kind: 'recorded', checkedInAt: at }, target, null, zone).kind).toBe(
      'error',
    );
  });

  it('reports a repeat as already registered with the first time', () => {
    const target = { activityId: 'a-1', name: 'Batalla 1vs1' };
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
    const target = eventEntry;
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
