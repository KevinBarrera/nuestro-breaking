import type { PublicEventSummary, PublicSales } from '@/entities/public-event';
import { describe, expect, it } from 'vitest';
import { closedSalesMessage, eventContext, eventDateRange } from './event-dates';

const event: PublicEventSummary = {
  slug: 'nov',
  name: 'Los más pesados',
  timeZone: 'America/Mexico_City',
  startsAt: '2026-11-21T15:00:00.000Z',
  endsAt: '2026-11-23T04:00:00.000Z',
};

const closed = (reason: 'disabled' | 'not_yet_open' | 'ended', opensAt: string | null = null) =>
  ({ state: 'closed', reason, opensAt, closesAt: null }) as PublicSales;

describe('eventContext', () => {
  it('joins the dates and the place for the purchase steps header (#330)', () => {
    expect(eventContext({ ...event, city: 'Guadalajara', state: 'Jalisco', country: 'MX' })).toBe(
      'Sábado 21 de noviembre – Domingo 22 de noviembre · Guadalajara, Jalisco',
    );
  });

  it('shows whichever part is known, or nothing', () => {
    expect(eventContext(event)).toBe('Sábado 21 de noviembre – Domingo 22 de noviembre');
    const noDates = { ...event, startsAt: null, endsAt: null };
    expect(eventContext({ ...noDates, city: 'Bogotá', state: 'Cundinamarca', country: 'CO' })).toBe(
      'Bogotá, Cundinamarca, Colombia',
    );
    expect(eventContext(noDates)).toBeNull();
  });
});

describe('eventDateRange', () => {
  it('shows the first and last day on the event clock', () => {
    expect(eventDateRange(event)).toBe('Sábado 21 de noviembre – Domingo 22 de noviembre');
  });

  it('shows one day when the event starts and ends the same day', () => {
    expect(eventDateRange({ ...event, endsAt: '2026-11-22T04:00:00.000Z' })).toBe(
      'Sábado 21 de noviembre',
    );
  });

  it('uses whichever date is known, or nothing', () => {
    expect(eventDateRange({ ...event, endsAt: null })).toBe('Sábado 21 de noviembre');
    expect(eventDateRange({ ...event, startsAt: null, endsAt: null })).toBeNull();
  });
});

describe('closedSalesMessage', () => {
  it('names the opening time on the event clock when sales have not opened yet', () => {
    expect(closedSalesMessage(closed('not_yet_open', '2026-10-15T15:00:00.000Z'), event)).toMatch(
      /^La venta abre el 15 oct 2026, 09:00$/,
    );
  });

  it('says sales are closed otherwise', () => {
    expect(closedSalesMessage(closed('not_yet_open'), event)).toBe(
      'La venta en línea está cerrada',
    );
    expect(closedSalesMessage(closed('ended'), event)).toBe('La venta en línea está cerrada');
    expect(closedSalesMessage(closed('disabled'), event)).toBe('La venta en línea está cerrada');
  });
});
