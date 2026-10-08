import { formatEventTime, fromZonedInput, toZonedInput } from '@/entities/event-catalog';
import type { EventSales, EventSalesInput } from '@/entities/event-sales';

// Pure derivations for the "Venta en línea" section of the event overview.

// Dates are entered and shown as wall-clock times in the event time zone, the same rule as the
// activity form (`fromZonedInput`/`toZonedInput`). When the event time zone cannot be read,
// the browser zone is used and labeled, so the admin knows which clock the fields use.
export type SalesZone = { timeZone: string; label: string };

export function salesZone(eventTimeZone: string | null): SalesZone {
  if (eventTimeZone)
    return { timeZone: eventTimeZone, label: `Hora del evento (${eventTimeZone})` };
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { timeZone: browser, label: `Hora de tu navegador (${browser})` };
}

export type SalesStatus = { label: 'Abierta' | 'Cerrada'; detail: string | null };

const at = (iso: string | null, timeZone: string) =>
  iso ? formatEventTime(iso, timeZone) : 'una fecha sin definir';

export function salesStatus(sales: EventSales, timeZone: string): SalesStatus {
  if (sales.state === 'open')
    return {
      label: 'Abierta',
      detail: sales.salesClosesAt ? `Cierra el ${at(sales.salesClosesAt, timeZone)}` : null,
    };
  const detail =
    sales.reason === 'not_yet_open'
      ? `Abre el ${at(sales.salesOpensAt, timeZone)}`
      : sales.reason === 'ended'
        ? `Cerró el ${at(sales.salesClosesAt, timeZone)}`
        : 'La venta está apagada';
  return { label: 'Cerrada', detail };
}

// The public route that serves this address is built in #176 (decision D1 of #175).
export const publicPath = (slug: string) => `/e/${slug}`;

// Form values: `datetime-local` strings on the zone clock, empty when the date is not set.
export type SalesForm = { enabled: boolean; opensAt: string; closesAt: string };
export type SalesFormErrors = { opensAt?: string; closesAt?: string };
export type SalesFormResult =
  { ok: true; input: EventSalesInput } | { ok: false; errors: SalesFormErrors };

export function salesFormFrom(sales: EventSales, timeZone: string): SalesForm {
  return {
    enabled: sales.salesEnabled,
    opensAt: sales.salesOpensAt ? toZonedInput(sales.salesOpensAt, timeZone) : '',
    closesAt: sales.salesClosesAt ? toZonedInput(sales.salesClosesAt, timeZone) : '',
  };
}

const invalidDate = 'Fecha u hora no válida.';

// Builds the full PUT body. Instants go out as UTC (`Z`), which the backend accepts as an
// explicit offset. The window is checked even with the switch off, as the backend does.
export function salesInputFrom(form: SalesForm, timeZone: string): SalesFormResult {
  const errors: SalesFormErrors = {};
  const convert = (value: string, field: keyof SalesFormErrors) => {
    if (value === '') return null;
    const instant = fromZonedInput(value, timeZone);
    if (instant === null) errors[field] = invalidDate;
    return instant;
  };
  const salesOpensAt = convert(form.opensAt, 'opensAt');
  const salesClosesAt = convert(form.closesAt, 'closesAt');
  if (salesOpensAt && salesClosesAt && Date.parse(salesOpensAt) >= Date.parse(salesClosesAt))
    errors.closesAt = 'El cierre debe ser después de la apertura.';
  if (errors.opensAt || errors.closesAt) return { ok: false, errors };
  return { ok: true, input: { salesEnabled: form.enabled, salesOpensAt, salesClosesAt } };
}
