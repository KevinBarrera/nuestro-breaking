import type { HistoryDetails } from '@/entities/registration-history';
import { describe, expect, it } from 'vitest';
import {
  emptyHistoryMessage,
  folioLabel,
  historyActorLabel,
  historyClockNote,
  historyDetailLine,
  historyTitle,
  reasonLine,
} from './history-model';

describe('historyTitle', () => {
  it('names each operation type in Spanish, with a fallback for unknown ones', () => {
    const titles: [HistoryDetails['kind'], string][] = [
      ['manual_registration', 'Inscripción presencial'],
      ['online_registration', 'Compra en línea'],
      ['complimentary_confirmation', 'Cortesía'],
      ['pass_assignment', 'Pase agregado'],
      ['pass_removal', 'Pase quitado'],
      ['pass_selection_change', 'Cambio de competencias'],
      ['cash_confirmation', 'Pago en efectivo'],
      ['cash_correction', 'Corrección de pago en efectivo'],
      ['payment_approval', 'Pago en línea aprobado'],
      ['registration_void', 'Inscripción anulada'],
      ['registration_expiry', 'Inscripción vencida'],
      ['registration_correction', 'Corrección de nombre o AKA'],
      ['registration_discipline_swap', 'Cambio de disciplina'],
      ['other', 'Otra operación'],
    ];
    for (const [kind, title] of titles) expect(historyTitle(kind)).toBe(title);
  });
});

describe('historyActorLabel', () => {
  it('shows the administrator name, or a generic label per actor kind', () => {
    expect(historyActorLabel({ kind: 'admin', name: 'Coordinación' })).toBe('Coordinación');
    expect(historyActorLabel({ kind: 'admin', name: null })).toBe('Administrador');
    expect(historyActorLabel({ kind: 'public', name: null })).toBe('Compra en línea');
    expect(historyActorLabel({ kind: 'system', name: null })).toBe('Sistema');
  });
});

describe('historyDetailLine', () => {
  it('has nothing to add for the plain registration operations', () => {
    expect(historyDetailLine({ kind: 'manual_registration' })).toBeNull();
    expect(historyDetailLine({ kind: 'online_registration' })).toBeNull();
    expect(historyDetailLine({ kind: 'complimentary_confirmation' })).toBeNull();
    expect(historyDetailLine({ kind: 'other' })).toBeNull();
  });

  it('names the pass added or removed', () => {
    expect(historyDetailLine({ kind: 'pass_assignment', passTypeName: 'Pase completo' })).toBe(
      'Pase: Pase completo',
    );
    expect(historyDetailLine({ kind: 'pass_removal', passTypeName: null })).toBe(
      'Pase: pase desconocido',
    );
  });

  it('lists the competitions added and removed in a selection change', () => {
    expect(
      historyDetailLine({
        kind: 'pass_selection_change',
        passTypeName: 'Pase completo',
        fromActivityNames: ['Batalla 1vs1', 'Cypher'],
        toActivityNames: ['Batalla 2vs2', 'Cypher', 'Kids'],
      }),
    ).toBe('Pase completo · Agregadas: Batalla 2vs2, Kids · Quitadas: Batalla 1vs1');
    expect(
      historyDetailLine({
        kind: 'pass_selection_change',
        passTypeName: null,
        fromActivityNames: ['Cypher'],
        toActivityNames: ['Cypher'],
      }),
    ).toBe('Sin cambios en las competencias');
  });

  it('shows the cash amount and receipt, and previous → new for a correction', () => {
    expect(
      historyDetailLine({ kind: 'cash_confirmation', amountCents: 150000, receipt: 'A-1' }),
    ).toBe('$1,500.00, recibo A-1');
    expect(
      historyDetailLine({ kind: 'cash_confirmation', amountCents: 150000, receipt: null }),
    ).toBe('$1,500.00, sin recibo');
    expect(
      historyDetailLine({
        kind: 'cash_correction',
        previous: { amountCents: 150000, receipt: 'A-1' },
        current: { amountCents: 120000, receipt: null },
      }),
    ).toBe('$1,500.00, recibo A-1 → $1,200.00, sin recibo');
    expect(
      historyDetailLine({
        kind: 'cash_correction',
        previous: { amountCents: null, receipt: null },
        current: { amountCents: 0, receipt: 'B-2' },
      }),
    ).toBe('Sin monto, sin recibo → $0.00, recibo B-2');
  });

  it('shows the approved amount and a late approval', () => {
    expect(
      historyDetailLine({ kind: 'payment_approval', amountCents: 99000, lateApproval: false }),
    ).toBe('$990.00');
    expect(
      historyDetailLine({ kind: 'payment_approval', amountCents: 99000, lateApproval: true }),
    ).toBe('$990.00 · Aprobado después del vencimiento');
    expect(
      historyDetailLine({ kind: 'payment_approval', amountCents: null, lateApproval: false }),
    ).toBeNull();
  });

  it('shows the status change of a void or an expiry', () => {
    expect(
      historyDetailLine({ kind: 'registration_void', fromStatus: 'confirmed', toStatus: 'voided' }),
    ).toBe('Confirmada → Anulada');
    expect(
      historyDetailLine({
        kind: 'registration_expiry',
        fromStatus: 'pending_payment',
        toStatus: 'expired',
      }),
    ).toBe('Pendiente de pago → Vencida');
    expect(
      historyDetailLine({ kind: 'registration_void', fromStatus: null, toStatus: 'voided' }),
    ).toBeNull();
    expect(
      historyDetailLine({ kind: 'registration_void', fromStatus: 'archived', toStatus: 'voided' }),
    ).toBe('Otro estado → Anulada');
  });

  it('translates the corrected name fields', () => {
    expect(
      historyDetailLine({
        kind: 'registration_correction',
        changedFields: ['firstName', 'firstLastName', 'secondLastName', 'stageName'],
      }),
    ).toBe('Cambió: nombre, primer apellido, segundo apellido, AKA');
    expect(
      historyDetailLine({ kind: 'registration_correction', changedFields: ['email', 'phone'] }),
    ).toBe('Cambió: otro dato');
    expect(historyDetailLine({ kind: 'registration_correction', changedFields: [] })).toBeNull();
  });

  it('shows the pass and competitions before and after a discipline swap', () => {
    expect(
      historyDetailLine({
        kind: 'registration_discipline_swap',
        fromPassTypeName: 'Batalla 1vs1',
        toPassTypeName: 'Batalla 2vs2',
        fromActivityNames: [],
        toActivityNames: [],
      }),
    ).toBe('Batalla 1vs1 → Batalla 2vs2');
    expect(
      historyDetailLine({
        kind: 'registration_discipline_swap',
        fromPassTypeName: null,
        toPassTypeName: 'Pase completo',
        fromActivityNames: ['Batalla 1vs1'],
        toActivityNames: [],
      }),
    ).toBe('pase desconocido → Pase completo · Competencias: Batalla 1vs1 → ninguna');
  });
});

describe('labels', () => {
  it('words the folio, the reason and the empty states', () => {
    expect(folioLabel('EB-0042')).toBe('Folio EB-0042');
    expect(folioLabel(null)).toBe('Sin folio');
    expect(reasonLine('Recibo equivocado')).toBe('Motivo: Recibo equivocado');
    expect(reasonLine(null)).toBeNull();
    expect(reasonLine('   ')).toBeNull();
    expect(emptyHistoryMessage('all')).toBe('Todavía no hay operaciones registradas.');
    expect(emptyHistoryMessage('corrections')).toBe('Todavía no hay correcciones registradas.');
  });

  it('says which clock the times use', () => {
    expect(historyClockNote('America/Tijuana')).toBe(
      'Horas en la zona horaria del evento: America/Tijuana.',
    );
    expect(historyClockNote(null)).toBe('Horas en la zona horaria de este dispositivo.');
  });
});
