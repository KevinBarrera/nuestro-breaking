import { eventLocation, formatEventDay, formatEventTime } from '@/entities/event-catalog';
import type { PublicEventSummary, PublicSales } from '@/entities/public-event';

// The event days on its own clock, e.g. "Sábado 21 de noviembre – Domingo 22 de noviembre".
export function eventDateRange(event: PublicEventSummary): string | null {
  const days = [event.startsAt, event.endsAt]
    .filter((iso): iso is string => iso !== null)
    .map((iso) => formatEventDay(iso, event.timeZone));
  const unique = [...new Set(days)];
  return unique.length > 0 ? unique.join(' – ') : null;
}

// The purchase steps header context: the dates, then where the event happens (#330).
export function eventContext(event: PublicEventSummary): string | null {
  const parts = [eventDateRange(event), eventLocation(event)].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// D4: closed sales name the opening time when it is still ahead; anything else is just closed.
export function closedSalesMessage(sales: PublicSales, event: PublicEventSummary): string {
  if (sales.state === 'closed' && sales.reason === 'not_yet_open' && sales.opensAt)
    return `La venta abre el ${formatEventTime(sales.opensAt, event.timeZone)}`;
  return 'La venta en línea está cerrada';
}
