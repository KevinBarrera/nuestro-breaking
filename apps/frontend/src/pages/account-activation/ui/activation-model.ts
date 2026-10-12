import { hasControlCharacters } from '@/shared/lib';

// Pure logic for the public account activation page (#214).

// Tokens are 32 random bytes in hex. Anything else is not a link we issued, so the page shows
// the invalid-link message without asking the server.
export function readActivationToken(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  return /^[a-fA-F0-9]{64}$/.test(token) ? token : null;
}

// Mirrors `failedPasswordRules` in apps/backend/src/identity-access/password-policy.ts; the
// backend checks again and its answer wins.
export const passwordRules = [
  'min_length',
  'max_length',
  'lowercase',
  'uppercase',
  'digit',
  'symbol',
  'no_control_characters',
] as const;
export type PasswordRule = (typeof passwordRules)[number];

export function failedPasswordRules(password: string): PasswordRule[] {
  const passes: Record<PasswordRule, boolean> = {
    min_length: password.length >= 12,
    max_length: password.length <= 1024,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^a-zA-Z0-9\s]/.test(password),
    no_control_characters: !hasControlCharacters(password),
  };
  return passwordRules.filter((rule) => !passes[rule]);
}

const ruleLabels: Record<PasswordRule, string> = {
  min_length: '12 caracteres o más',
  max_length: '1024 caracteres o menos',
  lowercase: 'Una letra minúscula',
  uppercase: 'Una letra mayúscula',
  digit: 'Un número',
  symbol: 'Un símbolo, por ejemplo ! # $ %',
  no_control_characters: 'Sin caracteres especiales invisibles',
};

// Always shown, in reading order; the other two rules appear only when they fail.
const visibleRules: PasswordRule[] = ['min_length', 'uppercase', 'lowercase', 'digit', 'symbol'];

export type ChecklistItem = { rule: PasswordRule; label: string; met: boolean };

export function passwordChecklist(password: string): ChecklistItem[] {
  const failed = new Set(failedPasswordRules(password));
  const rules = [
    ...visibleRules,
    ...passwordRules.filter((rule) => !visibleRules.includes(rule) && failed.has(rule)),
  ];
  return rules.map((rule) => ({ rule, label: ruleLabels[rule], met: !failed.has(rule) }));
}

export type ActivationErrors = { password?: string; confirmation?: string };

export function validateActivation(password: string, confirmation: string): ActivationErrors {
  const errors: ActivationErrors = {};
  if (failedPasswordRules(password).length > 0)
    errors.password = 'La contraseña todavía no cumple todas las reglas.';
  if (!confirmation) errors.confirmation = 'Repite la contraseña.';
  else if (confirmation !== password) errors.confirmation = 'Las contraseñas no coinciden.';
  return errors;
}

// The backend's `failedRules` ids, in Spanish; unknown ids are ignored.
export function weakPasswordMessage(failedRules: string[]): string {
  const labels = failedRules
    .filter((rule): rule is PasswordRule => passwordRules.some((known) => known === rule))
    .map((rule) => ruleLabels[rule].charAt(0).toLowerCase() + ruleLabels[rule].slice(1));
  return labels.length
    ? `La contraseña no cumple: ${labels.join('; ')}.`
    : 'La contraseña no cumple las reglas.';
}

export const invalidLinkMessage =
  'Este enlace no es válido o ya venció. Pide uno nuevo a un administrador.';

// Shown when a retry finds the link used after an attempt whose answer was lost.
export const maybeActiveMessage =
  'Es posible que tu cuenta ya esté activa. Intenta iniciar sesión; si no puedes, pide un nuevo enlace.';
