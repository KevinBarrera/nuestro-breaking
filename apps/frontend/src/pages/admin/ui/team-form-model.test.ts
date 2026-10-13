import { describe, expect, it } from 'vitest';
import {
  accessDraftFrom,
  accessError,
  accessInput,
  inviteMayExist,
  reasonError,
  serverFieldErrors,
  teamFailureMessage,
  validateInvite,
} from './team-form-model';

describe('teamFailureMessage', () => {
  it('explains every team rule in Spanish', () => {
    expect(teamFailureMessage({ kind: 'rule', code: 'email_in_use' })).toBe(
      'Ese correo ya tiene una cuenta. Usa otro correo.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'self_change' })).toBe(
      'No puedes cambiar tu propio acceso.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'self_deactivation' })).toBe(
      'No puedes desactivar tu propio acceso.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'last_global_admin' })).toBe(
      'Debe quedar al menos una persona activa con acceso a todos los eventos.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'member_deactivated' })).toBe(
      'Esta persona está desactivada. Reactívala primero.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'member_active' })).toBe(
      'Esta persona ya está activa. Recarga la lista.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'member_not_found' })).toBe(
      'No encontramos a esta persona en el equipo. Recarga la lista.',
    );
    expect(teamFailureMessage({ kind: 'rule', code: 'no_open_invitation' })).toBe(
      'Esta persona ya no tiene una invitación abierta. Recarga la lista.',
    );
  });

  it('covers sessions, invalid data and anything else', () => {
    expect(teamFailureMessage({ kind: 'denied' })).toBe(
      'Tu sesión terminó o ya no tienes acceso a todos los eventos. Vuelve a iniciar sesión.',
    );
    expect(teamFailureMessage({ kind: 'invalid', fieldErrors: {} })).toBe(
      'Revisa los datos e inténtalo de nuevo.',
    );
    expect(teamFailureMessage({ kind: 'error' })).toBe(
      'No se pudo completar la operación. Inténtalo de nuevo.',
    );
  });
});

describe('access drafts', () => {
  it('builds the request access', () => {
    expect(accessInput({ scope: 'global', eventIds: ['a'] })).toEqual({ kind: 'global' });
    expect(accessInput({ scope: 'events', eventIds: ['a', 'b'] })).toEqual({
      kind: 'events',
      eventIds: ['a', 'b'],
    });
  });

  it('starts from a member access', () => {
    expect(accessDraftFrom({ kind: 'global' })).toEqual({ scope: 'global', eventIds: [] });
    expect(accessDraftFrom({ kind: 'events', events: [{ id: 'a', name: 'A' }] })).toEqual({
      scope: 'events',
      eventIds: ['a'],
    });
    // Without access, the dialog starts with no event chosen and asks for one.
    expect(accessDraftFrom({ kind: 'none' })).toEqual({ scope: 'events', eventIds: [] });
  });
});

describe('validateInvite', () => {
  const valid = {
    displayName: 'Ana',
    email: 'ana@example.org',
    access: { scope: 'events' as const, eventIds: ['a'] },
  };

  it('accepts a complete invite', () => {
    expect(validateInvite(valid)).toEqual({});
  });

  it('requires a name, a valid email and at least one event', () => {
    expect(
      validateInvite({
        displayName: '  ',
        email: 'ana',
        access: { scope: 'events', eventIds: [] },
      }),
    ).toEqual({
      displayName: 'Escribe el nombre.',
      email: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
      access: 'Elige al menos un evento.',
    });
    expect(validateInvite({ ...valid, displayName: 'a'.repeat(201) })).toEqual({
      displayName: 'Usa 200 caracteres o menos.',
    });
    expect(validateInvite({ ...valid, access: { scope: 'global', eventIds: [] } })).toEqual({});
  });
});

describe('serverFieldErrors', () => {
  it('maps backend field codes without echoing values', () => {
    expect(
      serverFieldErrors({ displayName: 'invalid', email: 'invalid', access: 'unknown_event' }),
    ).toEqual({
      displayName: 'Revisa el nombre.',
      email: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
      access: 'Uno de los eventos elegidos ya no existe. Recarga la página.',
    });
    expect(serverFieldErrors({ access: 'invalid', reason: 'invalid' })).toEqual({
      access: 'Elige al menos un evento.',
      reason: 'Escribe un motivo de hasta 500 caracteres.',
    });
  });
});

describe('reasonError', () => {
  it('requires 1 to 500 characters without control characters', () => {
    expect(reasonError('  ')).toBe('Escribe el motivo.');
    expect(reasonError('x'.repeat(501))).toBe('Escribe un motivo de hasta 500 caracteres.');
    expect(reasonError('Terminó su participación')).toBeNull();
  });
});

describe('inviteMayExist', () => {
  it('flags an invite whose outcome is unknown', () => {
    expect(inviteMayExist({ kind: 'unknown' }, false)).toBe(true);
  });

  it('flags an email in use only after an earlier unknown outcome', () => {
    expect(inviteMayExist({ kind: 'rule', code: 'email_in_use' }, true)).toBe(true);
    expect(inviteMayExist({ kind: 'rule', code: 'email_in_use' }, false)).toBe(false);
  });

  it('does not flag refusals or plain errors', () => {
    expect(inviteMayExist({ kind: 'error' }, true)).toBe(false);
    expect(inviteMayExist({ kind: 'denied' }, true)).toBe(false);
    expect(inviteMayExist({ kind: 'invalid', fieldErrors: {} }, true)).toBe(false);
  });
});

describe('accessError', () => {
  it('asks for an event only when access is limited to events', () => {
    expect(accessError({ scope: 'events', eventIds: [] })).toBe('Elige al menos un evento.');
    expect(accessError({ scope: 'events', eventIds: ['e1'] })).toBeNull();
    expect(accessError({ scope: 'global', eventIds: [] })).toBeNull();
  });
});
