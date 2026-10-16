// Masked contact for possible-duplicate matches (#125): enough for an administrator to recognize
// a person without exposing the full email or phone.

/** `alex@example.com` → `a***@example.com`. A value without `@` is hidden completely. */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  return `${email.slice(0, Math.min(at, 1))}***${email.slice(at)}`;
}

/** Only the last four digits stay visible: `55 1234 4567` → `******4567`. */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
