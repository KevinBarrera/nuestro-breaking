// The per-event competitor number (#377): stored as a positive integer, shown with at least three
// digits ("007"); numbers above 999 show as they are.
export const formatCompetitorNumber = (value: number) => String(value).padStart(3, '0');

// A digits-only query matches the number by numeric equality, so "7" and "007" find 007 but not
// 017 or 070. Any other query never matches a number.
export function matchesCompetitorNumber(value: number | null, query: string): boolean {
  const digits = query.trim();
  if (value === null || !/^\d+$/.test(digits)) return false;
  return Number(digits) === value;
}
