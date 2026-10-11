import { describe, expect, it } from 'vitest';
import {
  failedPasswordRules,
  passwordChecklist,
  readActivationToken,
  validateActivation,
  weakPasswordMessage,
} from './activation-model';

const token = 'ab'.repeat(32);

describe('readActivationToken', () => {
  it('reads a 64-character hex token from the fragment', () => {
    expect(readActivationToken(`#${token}`)).toBe(token);
    expect(readActivationToken(`#${token.toUpperCase()}`)).toBe(token.toUpperCase());
  });

  it('rejects a missing or malformed token', () => {
    expect(readActivationToken('')).toBeNull();
    expect(readActivationToken('#')).toBeNull();
    expect(readActivationToken(`#${token}x`)).toBeNull();
    expect(readActivationToken('#not-a-token')).toBeNull();
    expect(readActivationToken(`#token=${token}`)).toBeNull();
  });
});

describe('failedPasswordRules', () => {
  it('mirrors the backend password policy in its rule order', () => {
    expect(failedPasswordRules('Breaking2026!')).toEqual([]);
    expect(failedPasswordRules('')).toEqual([
      'min_length',
      'lowercase',
      'uppercase',
      'digit',
      'symbol',
    ]);
    expect(failedPasswordRules('Breaking2026')).toEqual(['symbol']);
    expect(failedPasswordRules('breaking2026!')).toEqual(['uppercase']);
    expect(failedPasswordRules('BREAKING2026!')).toEqual(['lowercase']);
    expect(failedPasswordRules('Breaking!!!!!')).toEqual(['digit']);
    expect(failedPasswordRules('Ab1!')).toEqual(['min_length']);
    expect(failedPasswordRules(`Aa1!${'x'.repeat(1021)}`)).toEqual(['max_length']);
    expect(failedPasswordRules('Breaking2026!\u0007')).toEqual(['no_control_characters']);
    // Spaces are not symbols, as on the backend.
    expect(failedPasswordRules('Breaking 2026')).toEqual(['symbol']);
  });
});

describe('passwordChecklist', () => {
  it('lists the visible rules with whether each is met', () => {
    expect(passwordChecklist('Breaking2026')).toEqual([
      { rule: 'min_length', label: '12 caracteres o más', met: true },
      { rule: 'uppercase', label: 'Una letra mayúscula', met: true },
      { rule: 'lowercase', label: 'Una letra minúscula', met: true },
      { rule: 'digit', label: 'Un número', met: true },
      { rule: 'symbol', label: 'Un símbolo, por ejemplo ! # $ %', met: false },
    ]);
  });

  it('adds the rare rules only when they fail', () => {
    expect(passwordChecklist('Breaking2026!\u0007').at(-1)).toEqual({
      rule: 'no_control_characters',
      label: 'Sin caracteres especiales invisibles',
      met: false,
    });
  });
});

describe('validateActivation', () => {
  it('requires every rule and a matching confirmation', () => {
    expect(validateActivation('Breaking2026!', 'Breaking2026!')).toEqual({});
    expect(validateActivation('Breaking2026', 'Breaking2026')).toEqual({
      password: 'La contraseña todavía no cumple todas las reglas.',
    });
    expect(validateActivation('Breaking2026!', 'Breaking2026?')).toEqual({
      confirmation: 'Las contraseñas no coinciden.',
    });
    expect(validateActivation('Breaking2026!', '')).toEqual({
      confirmation: 'Repite la contraseña.',
    });
  });
});

describe('weakPasswordMessage', () => {
  it('names the rules the backend reported, ignoring unknown ids', () => {
    expect(weakPasswordMessage(['symbol', 'digit', 'mystery'])).toBe(
      'La contraseña no cumple: un símbolo, por ejemplo ! # $ %; un número.',
    );
    expect(weakPasswordMessage([])).toBe('La contraseña no cumple las reglas.');
  });
});
