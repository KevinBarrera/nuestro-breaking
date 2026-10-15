import { formatEventTime } from '@/entities/event-catalog';
import type { EventSales } from '@/entities/event-sales';
import { describe, expect, it } from 'vitest';
import { publicPath, salesFormFrom, salesInputFrom, salesStatus, salesZone } from './sales-model';

const zone = 'America/Mexico_City';
const opensAt = '2026-10-15T15:00:00.000Z';
const closesAt = '2026-11-20T06:00:00.000Z';

const sales = (overrides: Partial<EventSales>): EventSales => ({
  slug: 'los-mas-pesados-nov-2026',
  salesEnabled: true,
  salesOpensAt: null,
  salesClosesAt: null,
  state: 'open',
  reason: null,
  ...overrides,
});

describe('salesZone', () => {
  it('uses the event time zone and names it', () => {
    expect(salesZone(zone)).toEqual({ timeZone: zone, label: `Hora del evento (${zone})` });
  });

  it('falls back to the browser time zone and says so', () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(salesZone(null)).toEqual({
      timeZone: browser,
      label: `Hora de tu navegador (${browser})`,
    });
  });
});

describe('salesStatus', () => {
  it('explains each closed reason in plain Spanish', () => {
    expect(salesStatus(sales({ state: 'closed', reason: 'disabled' }), zone)).toEqual({
      label: 'Cerrada',
      detail: 'La venta está apagada',
    });
    expect(
      salesStatus(sales({ state: 'closed', reason: 'not_yet_open', salesOpensAt: opensAt }), zone),
    ).toEqual({ label: 'Cerrada', detail: `Abre el ${formatEventTime(opensAt, zone)}` });
    expect(
      salesStatus(sales({ state: 'closed', reason: 'ended', salesClosesAt: closesAt }), zone),
    ).toEqual({ label: 'Cerrada', detail: `Cerró el ${formatEventTime(closesAt, zone)}` });
  });

  it('formats dates on the event clock', () => {
    const status = salesStatus(
      sales({ state: 'closed', reason: 'not_yet_open', salesOpensAt: opensAt }),
      zone,
    );
    expect(status.detail).toContain('09:00');
  });

  it('shows the closing date while open, when there is one', () => {
    expect(salesStatus(sales({}), zone)).toEqual({ label: 'Abierta', detail: null });
    expect(salesStatus(sales({ salesClosesAt: closesAt }), zone)).toEqual({
      label: 'Abierta',
      detail: `Cierra el ${formatEventTime(closesAt, zone)}`,
    });
  });
});

describe('publicPath', () => {
  it('builds the public address from the slug', () => {
    expect(publicPath('los-mas-pesados-nov-2026')).toBe('/e/los-mas-pesados-nov-2026');
  });
});

describe('salesFormFrom', () => {
  it('shows saved dates as event-local wall-clock values and empty when unset', () => {
    expect(salesFormFrom(sales({ salesOpensAt: opensAt }), zone)).toEqual({
      enabled: true,
      opensAt: '2026-10-15T09:00',
      closesAt: '',
    });
  });
});

describe('salesInputFrom', () => {
  it('sends every key, with event-local values converted to UTC instants', () => {
    expect(
      salesInputFrom({ enabled: true, opensAt: '2026-10-15T09:00', closesAt: '' }, zone),
    ).toEqual({
      ok: true,
      input: { salesEnabled: true, salesOpensAt: opensAt, salesClosesAt: null },
    });
    expect(salesInputFrom({ enabled: false, opensAt: '', closesAt: '' }, zone)).toEqual({
      ok: true,
      input: { salesEnabled: false, salesOpensAt: null, salesClosesAt: null },
    });
  });

  it('requires the opening to be before the closing', () => {
    const message = 'El cierre debe ser después de la apertura.';
    for (const closes of ['2026-10-15T09:00', '2026-10-14T23:00'])
      expect(
        salesInputFrom({ enabled: true, opensAt: '2026-10-15T09:00', closesAt: closes }, zone),
      ).toEqual({ ok: false, errors: { closesAt: message } });
  });

  it('rejects unreadable dates per field', () => {
    expect(
      salesInputFrom({ enabled: true, opensAt: '2026-13-01T09:00', closesAt: 'x' }, zone),
    ).toEqual({
      ok: false,
      errors: { opensAt: 'Fecha u hora no válida.', closesAt: 'Fecha u hora no válida.' },
    });
  });
});
