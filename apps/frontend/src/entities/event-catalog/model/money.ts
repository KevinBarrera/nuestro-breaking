const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const MAX_PRICE_CENTS = 2147483647;

export function formatMxn(cents: number): string {
  return mxn.format(cents / 100);
}

// Accepts "250", "250.5" or "1500,50" (dot or comma as the decimal separator) and returns
// integer cents without floating-point rounding. Thousand separators are rejected because
// "1,500" or "1.500" could mean either 1500 or 1.5 pesos.
export function parseMxnToCents(value: string): number | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
