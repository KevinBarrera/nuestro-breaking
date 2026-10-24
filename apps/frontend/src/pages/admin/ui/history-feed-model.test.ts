import type { HistoryDetails, HistoryItem } from '@/entities/registration-history';
import { describe, expect, it } from 'vitest';
import {
  historyClockLabel,
  historyDays,
  historyEntry,
  historyRangeLabel,
  movementsLabel,
} from './history-feed-model';

const zone = 'America/Mexico_City';
// 2026-10-23 12:00 in Mexico City (UTC-6).
const now = new Date('2026-10-23T18:00:00.000Z');
const admin = { kind: 'admin' as const, name: 'Local Admin' };
const reg = (id: string, folio: string | null = 'EV-PE4M', participantName = 'Mau Aczino') => ({
  id,
  folio,
  participantName,
});

let ids = 0;
function item(
  occurredAt: string,
  details: HistoryDetails,
  overrides: Partial<HistoryItem> = {},
): HistoryItem {
  ids += 1;
  return {
    id: `h${ids}`,
    occurredAt,
    operationType: details.kind,
    actor: admin,
    registration: reg('r1'),
    reason: null,
    details,
    ...overrides,
  };
}

describe('historyEntry', () => {
  it('shows a cash correction as Antes / Después rows for what changed', () => {
    const entry = historyEntry(
      item(
        '2026-10-21T19:12:00.000Z',
        {
          kind: 'cash_correction',
          previous: { amountCents: 200000, receipt: '08564' },
          current: { amountCents: 201000, receipt: '08564' },
        },
        { reason: 'Para facilitar el cambio' },
      ),
      zone,
    );
    expect(entry).toMatchObject({
      time: '13:12',
      title: 'Corrección de pago en efectivo',
      kind: 'correction',
      actor: 'Local Admin',
      diff: [{ label: 'Monto', before: '$2,000.00', after: '$2,010.00', mono: true }],
      summary: 'Recibo 08564, sin cambios',
      reason: 'Para facilitar el cambio',
      competitions: null,
      steps: [],
    });
    const receipt = historyEntry(
      item('2026-10-21T19:12:00.000Z', {
        kind: 'cash_correction',
        previous: { amountCents: 100000, receipt: null },
        current: { amountCents: 100000, receipt: 'R-9' },
      }),
      zone,
    );
    expect(receipt.diff).toEqual([
      { label: 'Recibo', before: 'Sin recibo', after: 'R-9', mono: true },
    ]);
    expect(receipt.summary).toBe('Monto $1,000.00, sin cambios');
  });

  it('shows a discipline swap and a void as rows', () => {
    const swap = historyEntry(
      item(
        '2026-10-21T17:52:00.000Z',
        {
          kind: 'registration_discipline_swap',
          fromPassTypeName: 'Pase completo Breaking',
          toPassTypeName: 'Pase completo Popping',
          fromActivityNames: ['Breaking 1v1 Toprock'],
          toActivityNames: [],
        },
        { reason: 'Cambio' },
      ),
      zone,
    );
    expect(swap.kind).toBe('correction');
    expect(swap.diff).toEqual([
      { label: 'Pase', before: 'Pase completo Breaking', after: 'Pase completo Popping' },
      { label: 'Competencias', before: 'Breaking 1v1 Toprock', after: 'Sin competencias' },
    ]);
    const voided = historyEntry(
      item('2026-10-21T17:00:00.000Z', {
        kind: 'registration_void',
        fromStatus: 'confirmed',
        toStatus: 'voided',
      }),
      zone,
    );
    expect(voided.diff).toEqual([{ label: 'Estado', before: 'Confirmada', after: 'Anulada' }]);
    expect(voided.kind).toBe('correction');
    const expired = historyEntry(
      item('2026-10-21T17:00:00.000Z', {
        kind: 'registration_expiry',
        fromStatus: null,
        toStatus: null,
      }),
      zone,
    );
    expect(expired).toMatchObject({ kind: 'other', diff: [], summary: null });
  });

  it('names the changed fields of a name or AKA correction, without values', () => {
    const entry = historyEntry(
      item('2026-10-21T19:13:00.000Z', {
        kind: 'registration_correction',
        changedFields: ['stageName', 'firstName', 'stageName'],
      }),
      zone,
    );
    expect(entry.diff).toEqual([{ label: 'Cambió', before: null, after: 'AKA, nombre' }]);
  });

  it('lists added and removed competitions, and counts a reasoned change as a correction', () => {
    const entry = historyEntry(
      item(
        '2026-10-23T16:24:00.000Z',
        {
          kind: 'pass_selection_change',
          passTypeName: 'Pase completo Popping',
          fromActivityNames: ['Popping 1v1'],
          toActivityNames: ['Popping 1v1 beginner', 'Popping 2v2'],
        },
        { reason: 'Cambio a la entrada' },
      ),
      zone,
    );
    expect(entry.kind).toBe('correction');
    expect(entry.competitions).toEqual({
      passName: 'Pase completo Popping',
      added: ['Popping 1v1 beginner', 'Popping 2v2'],
      removed: ['Popping 1v1'],
    });
    const unreasoned = historyEntry(
      item('2026-10-23T16:24:00.000Z', {
        kind: 'pass_selection_change',
        passTypeName: null,
        fromActivityNames: ['A'],
        toActivityNames: ['A'],
      }),
      zone,
    );
    expect(unreasoned).toMatchObject({
      kind: 'registration',
      competitions: null,
      summary: 'Sin cambios en las competencias',
    });
  });

  it('keeps a one-line summary for the other operations', () => {
    const at = '2026-10-20T15:06:00.000Z';
    expect(
      historyEntry(item(at, { kind: 'complimentary_confirmation' }, { reason: 'Ganador' }), zone),
    ).toMatchObject({ kind: 'complimentary', summary: 'Pase sin costo', reason: 'Ganador' });
    expect(
      historyEntry(
        item(at, { kind: 'cash_confirmation', amountCents: 100000, receipt: '8264' }),
        zone,
      ).summary,
    ).toBe('$1,000.00, recibo 8264');
    expect(
      historyEntry(
        item(
          at,
          { kind: 'payment_approval', amountCents: 103000, lateApproval: false },
          {
            actor: { kind: 'system', name: null },
          },
        ),
        zone,
      ),
    ).toMatchObject({ kind: 'registration', summary: '$1,030.00', actor: 'Sistema' });
    expect(historyEntry(item(at, { kind: 'other' }), zone)).toMatchObject({
      kind: 'other',
      summary: null,
    });
    expect(
      historyEntry(
        item(
          at,
          {
            kind: 'pass_selection_change',
            passTypeName: null,
            fromActivityNames: [],
            toActivityNames: [],
          },
          { reason: '  ' },
        ),
        zone,
      ).reason,
    ).toBeNull();
  });
});

describe('historyDays', () => {
  // Mau Aczino's on-site sale, newest first as the API returns it.
  const sale = () => [
    item('2026-10-23T15:46:30.000Z', {
      kind: 'cash_confirmation',
      amountCents: 100000,
      receipt: '8264',
    }),
    item('2026-10-23T15:46:00.000Z', { kind: 'pass_assignment', passTypeName: 'Entrada general' }),
    item('2026-10-23T15:45:00.000Z', { kind: 'manual_registration' }),
  ];

  it('collapses an on-site registration with its passes and cash payment', () => {
    const [day] = historyDays([sale()], zone, now);
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({
      time: '09:45',
      title: 'Inscripción en mesa',
      kind: 'registration',
      summary: 'Entrada general · $1,000.00 en efectivo, recibo 8264',
      steps: [
        { time: '09:45', label: 'Inscripción presencial', detail: null },
        { time: '09:46', label: 'Pase agregado', detail: 'Entrada general' },
        { time: '09:46', label: 'Pago en efectivo', detail: '$1,000.00, recibo 8264' },
      ],
    });
  });

  it('joins several passes and leaves out the cash when there is none', () => {
    const at = (minute: string) => `2026-10-20T20:${minute}:00.000Z`;
    const [day] = historyDays(
      [
        [
          item(at('15'), { kind: 'pass_assignment', passTypeName: 'Open Styles' }),
          item(at('15'), { kind: 'pass_assignment', passTypeName: 'Pase completo Breaking' }),
          item(at('14'), { kind: 'manual_registration' }),
        ],
      ],
      zone,
      now,
    );
    expect(day.entries[0].summary).toBe('Pase completo Breaking + Open Styles');
    expect(day.entries[0].steps.map((step) => step.detail)).toEqual([
      null,
      'Pase completo Breaking',
      'Open Styles',
    ]);
  });

  it('does not group across registrations, actors, other types, 15 minutes or pages', () => {
    const titles = (pages: HistoryItem[][]) =>
      historyDays(pages, zone, now).flatMap((day) => day.entries.map((entry) => entry.title));
    const [cash, pass, created] = sale();
    expect(titles([[{ ...pass, registration: reg('r2') }, created]])).toEqual([
      'Pase agregado',
      'Inscripción presencial',
    ]);
    expect(titles([[{ ...pass, actor: { kind: 'admin', name: 'Otra' } }, created]])).toEqual([
      'Pase agregado',
      'Inscripción presencial',
    ]);
    expect(titles([[{ ...pass, occurredAt: '2026-10-23T16:00:01.000Z' }, created]])).toEqual([
      'Pase agregado',
      'Inscripción presencial',
    ]);
    expect(titles([[created, { ...pass, occurredAt: '2026-10-23T15:44:00.000Z' }]])).toEqual([
      'Inscripción presencial',
      'Pase agregado',
    ]);
    expect(titles([[cash, pass], [created]])).toEqual([
      'Pago en efectivo',
      'Pase agregado',
      'Inscripción presencial',
    ]);
    expect(titles([[created]])).toEqual(['Inscripción presencial']);
  });

  it('groups by day on the event clock with Spanish headings and counts', () => {
    const days = historyDays(
      [
        [
          item('2026-10-23T16:24:00.000Z', { kind: 'other' }),
          ...sale(),
          // 23:30 on the 21st in Mexico City, already the 22nd in UTC.
          item('2026-10-22T05:30:00.000Z', { kind: 'other' }),
          item('2026-10-20T15:06:00.000Z', { kind: 'complimentary_confirmation' }),
        ],
      ],
      zone,
      now,
    );
    expect(days.map((day) => [day.key, day.label, day.countLabel])).toEqual([
      ['2026-10-23', 'Hoy · viernes 23 de octubre', '2 movimientos'],
      ['2026-10-21', 'Miércoles 21 de octubre', '1 movimiento'],
      ['2026-10-20', 'Martes 20 de octubre', '1 movimiento'],
    ]);
    expect(days[0].entries.map((entry) => entry.time)).toEqual(['10:24', '09:45']);
  });

  it('keeps one heading when a day continues on the next page', () => {
    const days = historyDays(
      [
        [item('2026-10-21T19:13:00.000Z', { kind: 'other' })],
        [item('2026-10-21T17:52:00.000Z', { kind: 'other' })],
      ],
      zone,
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].countLabel).toBe('2 movimientos');
  });
});

describe('labels', () => {
  it('counts movements in Spanish', () => {
    expect(movementsLabel(0)).toBe('0 movimientos');
    expect(movementsLabel(1)).toBe('1 movimiento');
    expect(movementsLabel(9)).toBe('9 movimientos');
  });

  it('says which days are shown', () => {
    const days = (...isos: string[]) =>
      historyDays([isos.map((iso) => item(iso, { kind: 'other' }))], zone, now);
    expect(historyRangeLabel(days('2026-10-23T16:00:00.000Z', '2026-10-20T16:00:00.000Z'))).toBe(
      'Mostrando del 20 al 23 de octubre · 2 movimientos',
    );
    expect(historyRangeLabel(days('2026-10-02T16:00:00.000Z', '2026-09-30T16:00:00.000Z'))).toBe(
      'Mostrando del 30 de septiembre al 2 de octubre · 2 movimientos',
    );
    expect(historyRangeLabel(days('2026-10-23T16:00:00.000Z'))).toBe(
      'Mostrando el 23 de octubre · 1 movimiento',
    );
    expect(historyRangeLabel([])).toBe('');
  });

  it('names the clock the times use', () => {
    expect(historyClockLabel('America/Mexico_City')).toBe('Horas de Ciudad de México');
    expect(historyClockLabel('America/Tijuana')).toBe('Horas de Tijuana');
    expect(historyClockLabel('America/Argentina/Buenos_Aires')).toBe('Horas de Buenos Aires');
    expect(historyClockLabel(null)).toBe('Horas de este dispositivo');
  });
});
