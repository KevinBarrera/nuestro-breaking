import { describe, expect, it } from 'vitest';
import { formatReceivedAt, reasonCopy, registrationStatusLabel } from './payments-review-model';

describe('payments review copy', () => {
  it('explains each flagged reason and what coordination should do', () => {
    expect(reasonCopy.approved_after_expiry_duplicate).toEqual({
      title: 'Pagó dos veces',
      action: 'Revisa la otra inscripción y reembolsa uno de los pagos en Mercado Pago.',
      detail:
        'El pago llegó cuando la inscripción ya había vencido y la persona ya tiene otra inscripción en el evento.',
    });
    expect(reasonCopy.approved_after_expiry_event_ended.title).toBe('Pagó después del evento');
    expect(reasonCopy.approved_after_confirmation.title).toBe(
      'Pago de más en una inscripción confirmada',
    );
    expect(reasonCopy.approved_after_void.title).toBe('Pagó una inscripción anulada');
  });

  it('names registration statuses in Spanish and keeps unknown ones visible', () => {
    expect(registrationStatusLabel('pending_payment')).toBe('Pendiente de pago');
    expect(registrationStatusLabel('confirmed')).toBe('Confirmada');
    expect(registrationStatusLabel('voided')).toBe('Anulada');
    expect(registrationStatusLabel('archived')).toBe('archived');
  });

  it('formats when the payment arrived in the given time zone', () => {
    expect(formatReceivedAt('2026-11-02T18:04:00.000Z', 'America/Mexico_City')).toBe(
      '2 nov 2026, 12:04',
    );
  });
});
