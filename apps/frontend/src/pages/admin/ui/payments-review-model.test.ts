import { describe, expect, it } from 'vitest';
import {
  caseChips,
  formatReceivedAt,
  paymentCountText,
  reasonCopy,
  registrationStatusLabel,
  reviewCases,
  startsCollapsed,
  statusTone,
  totalAmountCents,
  visibleCases,
} from './payments-review-model';

const payment = (
  reason: Parameters<typeof reviewCases>[0][number]['reason'],
  amountCents = 100,
) => ({
  reason,
  amountCents,
});

describe('payments review copy', () => {
  it('explains each case and what coordination should do, as in the design', () => {
    expect(reasonCopy.approved_after_expiry_duplicate).toEqual({
      chip: 'Pagó dos veces',
      title: 'Pagó dos veces',
      detail:
        'El pago llegó cuando la inscripción ya había vencido, y la persona ya tiene otra inscripción en el evento.',
      action:
        'Reembolsa en Mercado Pago el pago de esta lista. No toques el de su otra inscripción: esa se conserva.',
    });
    expect(reasonCopy.approved_after_expiry_event_ended).toEqual({
      chip: 'Después del evento',
      title: 'Pagó después del evento',
      detail:
        'El pago llegó cuando la inscripción ya había vencido y el evento ya había terminado.',
      action: 'Contacta a la persona y reembolsa el pago en Mercado Pago.',
    });
    expect(reasonCopy.approved_after_confirmation).toEqual({
      chip: 'Pago de más',
      title: 'Pago de más en una inscripción confirmada',
      detail: 'La inscripción ya estaba confirmada por otro pago o en efectivo.',
      action: 'Reembolsa este pago en Mercado Pago.',
    });
    expect(reasonCopy.approved_after_void).toEqual({
      chip: 'Inscripción anulada',
      title: 'Pagó una inscripción anulada',
      detail: 'La inscripción se anuló antes de que llegara el pago.',
      action:
        'Decide con coordinación si la persona se inscribe de nuevo o si reembolsas el pago en Mercado Pago.',
    });
  });

  it('names registration statuses in Spanish and keeps unknown ones visible', () => {
    expect(registrationStatusLabel('pending_payment')).toBe('Pendiente de pago');
    expect(registrationStatusLabel('confirmed')).toBe('Confirmada');
    expect(registrationStatusLabel('voided')).toBe('Anulada');
    expect(registrationStatusLabel('archived')).toBe('archived');
  });

  it('colors confirmed green, pending orange and anything else grey', () => {
    expect(statusTone('confirmed')).toBe('success');
    expect(statusTone('pending_payment')).toBe('warning');
    expect(statusTone('voided')).toBe('neutral');
    expect(statusTone('archived')).toBe('neutral');
  });

  it('formats when the payment arrived in the given time zone', () => {
    expect(formatReceivedAt('2026-11-02T18:04:00.000Z', 'America/Mexico_City')).toBe(
      '2 nov 2026, 12:04',
    );
  });

  it('counts payments in singular and plural', () => {
    expect(paymentCountText(1)).toBe('1 pago');
    expect(paymentCountText(3)).toBe('3 pagos');
  });
});

describe('payments review cases', () => {
  const payments = [
    payment('approved_after_void', 15000),
    payment('approved_after_expiry_duplicate', 45000),
    payment('approved_after_void', 15000),
    payment('approved_after_expiry_duplicate', 30000),
    payment('approved_after_expiry_duplicate', 45000),
  ];

  it('groups payments by case in a fixed order, keeping the list order inside each case', () => {
    const cases = reviewCases(payments);
    expect(cases.map(({ reason, amountCents }) => ({ reason, amountCents }))).toEqual([
      { reason: 'approved_after_expiry_duplicate', amountCents: 120000 },
      { reason: 'approved_after_void', amountCents: 30000 },
    ]);
    expect(cases[0]?.payments).toEqual([payments[1], payments[3], payments[4]]);
    expect(reviewCases([])).toEqual([]);
  });

  it('totals every payment', () => {
    expect(totalAmountCents(payments)).toBe(150000);
    expect(totalAmountCents([])).toBe(0);
  });

  it('offers "Todos los casos" plus a chip per case present, with counts', () => {
    expect(caseChips(reviewCases(payments))).toEqual([
      { id: 'all', label: 'Todos los casos', count: 5 },
      { id: 'approved_after_expiry_duplicate', label: 'Pagó dos veces', count: 3 },
      { id: 'approved_after_void', label: 'Inscripción anulada', count: 2 },
    ]);
  });

  it('shows every case, or only the chosen one', () => {
    const cases = reviewCases(payments);
    expect(visibleCases(cases, 'all')).toEqual(cases);
    expect(visibleCases(cases, 'approved_after_void').map(({ reason }) => reason)).toEqual([
      'approved_after_void',
    ]);
  });

  it('starts the cases closed only with more than 8 payments', () => {
    expect(startsCollapsed(8)).toBe(false);
    expect(startsCollapsed(9)).toBe(true);
  });
});
