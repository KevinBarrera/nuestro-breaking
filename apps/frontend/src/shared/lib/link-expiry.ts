// When a one-time link stops working, in Spanish: "14 de octubre de 2026, 18:20". Without a
// time zone it uses the browser's, so people read their local time.
export function formatLinkExpiry(expiresAt: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(expiresAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('day')} de ${part('month')} de ${part('year')}, ${part('hour')}:${part('minute')}`;
}
