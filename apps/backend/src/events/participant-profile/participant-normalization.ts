// Pure normalization shared by registration flows. Comparison keys (email, phone, Instagram) are
// derived from what a person typed so that cosmetic differences do not hide a duplicate.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Digits only. A country code the person typed stays as digits, so `+52 55…` and `55…` differ.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeInstagram(handle: string): string {
  return handle.trim().replace(/^@+/, '').trim().toLowerCase();
}

const collapse = (part: string) => part.trim().replace(/\s+/g, ' ');

// `full_name` stays the display name used by lists and search; it is built from the #58 parts.
export function buildFullName(
  firstName: string,
  firstLastName: string,
  secondLastName?: string | null,
): string {
  return [firstName, firstLastName, secondLastName ?? '']
    .map(collapse)
    .filter((part) => part.length > 0)
    .join(' ');
}
