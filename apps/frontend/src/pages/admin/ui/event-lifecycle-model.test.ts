import { describe, expect, it } from 'vitest';
import {
  blockerList,
  deleteFailureMessage,
  deleteUnavailableReason,
  listNotice,
  slugConfirmed,
} from './event-lifecycle-model';

describe('blockerList', () => {
  it('names each blocker in plain Spanish, joined with commas and «y»', () => {
    expect(blockerList(['activities'])).toBe('actividades');
    expect(blockerList(['activities', 'passTypes'])).toBe('actividades y pases');
    expect(blockerList(['activities', 'passTypes', 'registrations'])).toBe(
      'actividades, pases e inscripciones',
    );
    expect(
      blockerList([
        'activities',
        'passTypes',
        'registrations',
        'checkIns',
        'catalogAudit',
        'registrationAudit',
      ]),
    ).toBe(
      'actividades, pases, inscripciones, check-ins, historial de cambios del catálogo e historial de inscripciones',
    );
  });
});

describe('deleteUnavailableReason', () => {
  it('says what the event already has and suggests archiving', () => {
    expect(deleteUnavailableReason(['activities', 'passTypes', 'registrations'])).toBe(
      'No disponible: este evento ya tiene actividades, pases e inscripciones. Solo se elimina un evento vacío, por ejemplo uno creado por error. Para quitarlo de la operación, archívalo.',
    );
  });

  it('falls back to a general reason when the blockers are not known', () => {
    expect(deleteUnavailableReason([])).toBe(
      'No disponible: este evento ya tiene datos. Solo se elimina un evento vacío, por ejemplo uno creado por error. Para quitarlo de la operación, archívalo.',
    );
  });
});

describe('slugConfirmed', () => {
  it('needs the exact slug, like the API', () => {
    expect(slugConfirmed('los-mas-pesados', 'los-mas-pesados')).toBe(true);
    expect(slugConfirmed(' los-mas-pesados', 'los-mas-pesados')).toBe(false);
    expect(slugConfirmed('LOS-MAS-PESADOS', 'los-mas-pesados')).toBe(false);
    expect(slugConfirmed('', 'los-mas-pesados')).toBe(false);
  });
});

describe('deleteFailureMessage', () => {
  it('explains a mismatch, a lost answer and other failures in Spanish', () => {
    expect(deleteFailureMessage({ kind: 'invalid', fieldErrors: { confirmSlug: 'invalid' } })).toBe(
      'La dirección no coincide. Escríbela tal como aparece arriba.',
    );
    expect(deleteFailureMessage({ kind: 'not_found' })).toBe(
      'Este evento ya no existe. Vuelve a la lista de eventos.',
    );
    expect(deleteFailureMessage({ kind: 'error' })).toBe(
      'No se pudo completar la operación. Inténtalo de nuevo.',
    );
  });
});

describe('listNotice', () => {
  it('reads the notice a screen leaves for the event list, and ignores anything else', () => {
    expect(listNotice({ notice: 'Evento eliminado.' })).toBe('Evento eliminado.');
    for (const state of [null, undefined, 'texto', { notice: 3 }, { notice: '' }])
      expect(listNotice(state)).toBeNull();
  });
});
