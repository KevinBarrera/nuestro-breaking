import { argon2id, hash } from 'argon2';

/** Rules an administrator password must meet; shared by local provisioning and account activation. */
export const PASSWORD_RULES = [
  'min_length',
  'max_length',
  'lowercase',
  'uppercase',
  'digit',
  'symbol',
  'no_control_characters',
] as const;
export type PasswordRule = (typeof PASSWORD_RULES)[number];

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 1024;

/** Returns the rules the password fails, in `PASSWORD_RULES` order. Never echoes the password. */
export function failedPasswordRules(password: string): PasswordRule[] {
  const passes: Record<PasswordRule, boolean> = {
    min_length: password.length >= PASSWORD_MIN_LENGTH,
    max_length: password.length <= PASSWORD_MAX_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^a-zA-Z0-9\s]/.test(password),
    no_control_characters: !hasControlCharacters(password),
  };
  return PASSWORD_RULES.filter((rule) => !passes[rule]);
}

export function isStrongPassword(password: string): boolean {
  return failedPasswordRules(password).length === 0;
}

/** Argon2id PHC string, the only verifier format sign-in accepts. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

export function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
