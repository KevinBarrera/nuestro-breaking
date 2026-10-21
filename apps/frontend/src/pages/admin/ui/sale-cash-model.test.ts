import { describe, expect, it } from 'vitest';
import {
  adminRegistrationRuleCodes,
  registrationStatuses,
  type AdminRegistrationFailure,
  type CashConfirmation,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import type { CatalogActivity } from '@/entities/event-catalog';
import {
  cashConfirmation,
  cashFormErrors,
  cashPaymentInput,
  cashTotalCents,
  cashUnavailableReason,
  confirmCashFailure,
  confirmedEntitlements,
  registrationViewMode,
  selectionSummary,
} from './sale-cash-model';

const pass = (id: string, priceCents: number, selections: string[] = []): HeldPass => ({
  registrationPassId: `rp-${id}`,
  passTypeId: `pt-${id}`,
  name: `Pase ${id}`,
  passClass: 'full',
  priceCents,
  selections,
});

const activity = (id: string, name: string): CatalogActivity => ({
  id,
  eventId: 'event-1',
  venueId: 'venue-1',
  kind: 'competition',
  name,
  startsAt: '2026-11-14T18:00:00.000Z',
  endsAt: '2026-11-14T19:00:00.000Z',
  status: 'active',
  version: 1,
});

describe('cashTotalCents', () => {
  it('adds the prices of the held passes, with no service charge', () => {
    expect(cashTotalCents([pass('a', 150000), pass('b', 20000)])).toBe(170000);
    expect(cashTotalCents([])).toBe(0);
  });
});

describe('cashUnavailableReason', () => {
  it('blocks the payment until a pass is held', () => {
    expect(cashUnavailableReason([])).toBe('Agrega al menos un pase antes de registrar el pago.');
  });

  it('blocks a zero total, which is confirmed without payment instead (#263)', () => {
    expect(cashUnavailableReason([pass('a', 0), pass('b', 0)])).toBe(
      'Esta inscripción no tiene monto a cobrar: confírmala sin cobro.',
    );
  });

  it('allows a payment for held passes with a price', () => {
    expect(cashUnavailableReason([pass('a', 30000)])).toBeNull();
  });
});

describe('cashFormErrors', () => {
  it('requires a receipt number of 1 to 50 characters once trimmed', () => {
    expect(cashFormErrors({ receipt: '   ', note: '' })).toEqual({
      receipt: 'Escribe el número del recibo en papel.',
    });
    expect(cashFormErrors({ receipt: 'A'.repeat(51), note: '' })).toEqual({
      receipt: 'Usa máximo 50 caracteres.',
    });
    expect(cashFormErrors({ receipt: ` ${'A'.repeat(50)} `, note: '' })).toEqual({});
  });

  it('limits the optional note to 500 characters once trimmed', () => {
    expect(cashFormErrors({ receipt: 'A-17', note: 'x'.repeat(501) })).toEqual({
      note: 'Usa máximo 500 caracteres.',
    });
    expect(cashFormErrors({ receipt: 'A-17', note: ` ${'x'.repeat(500)} ` })).toEqual({});
  });
});

describe('cashPaymentInput', () => {
  it('sends the computed total and the trimmed receipt and note', () => {
    expect(
      cashPaymentInput([pass('a', 150000), pass('b', 20000)], {
        receipt: '  A-17 ',
        note: ' Pagó con billetes de 500 ',
      }),
    ).toEqual({ amountCents: 170000, receipt: 'A-17', note: 'Pagó con billetes de 500' });
  });

  it('leaves out a blank note, which the backend would reject', () => {
    expect(cashPaymentInput([pass('a', 30000)], { receipt: 'A-17', note: '   ' })).toEqual({
      amountCents: 30000,
      receipt: 'A-17',
    });
  });
});

describe('cashConfirmation', () => {
  it('restates the total, the receipt and the participant', () => {
    expect(
      cashConfirmation({ totalCents: 170000, receipt: ' A-17 ', participantName: 'Ana López' }),
    ).toEqual({
      title: '¿Confirmar el pago de $1,700.00?',
      consequence:
        'Recibo A-17 de Ana López. La inscripción quedará confirmada con su folio y el pago no se podrá corregir desde esta pantalla.',
    });
  });
});

describe('confirmCashFailure', () => {
  const failure = (value: AdminRegistrationFailure) => confirmCashFailure(value);

  it('shows a taken receipt on the receipt field, without a reload', () => {
    expect(failure({ kind: 'rule', code: 'receipt_taken' })).toEqual({
      field: 'receipt',
      message: 'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
      reload: false,
    });
  });

  it('shows a rejected receipt on the receipt field', () => {
    expect(failure({ kind: 'invalid', fieldErrors: { receipt: 'invalid' } })).toEqual({
      field: 'receipt',
      message: 'Escribe un número de recibo de 1 a 50 caracteres.',
      reload: false,
    });
  });

  it('never offers a retry when the outcome is unknown', () => {
    expect(failure({ kind: 'unknown' })).toEqual({
      field: null,
      message:
        'No pudimos confirmar si el pago se registró. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
  });

  it('offers a reload when the registration changed or the amount is stale', () => {
    for (const code of adminRegistrationRuleCodes.filter((code) => code !== 'receipt_taken'))
      expect(failure({ kind: 'rule', code })).toMatchObject({ field: null, reload: true });
    expect(failure({ kind: 'rule', code: 'registration_not_pending' }).message).toBe(
      'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
    );
    expect(failure({ kind: 'invalid', fieldErrors: { amountCents: 'invalid' } })).toEqual({
      field: null,
      message: 'El total ya no es válido. Recarga para ver los pases actuales.',
      reload: true,
    });
    expect(failure({ kind: 'not_found' })).toMatchObject({ field: null, reload: true });
  });

  it('explains denials and other failures without a reload', () => {
    expect(failure({ kind: 'forbidden' })).toEqual({
      field: null,
      message: 'Sin acceso: tu cuenta no puede registrar pagos en este evento.',
      reload: false,
    });
    expect(failure({ kind: 'unauthorized' }).reload).toBe(false);
    expect(failure({ kind: 'invalid', fieldErrors: {} })).toEqual({
      field: null,
      message: 'Revisa los datos del pago.',
      reload: false,
    });
    expect(failure({ kind: 'error' })).toEqual({
      field: null,
      message: 'No pudimos registrar el pago. Intenta de nuevo.',
      reload: false,
    });
  });
});

describe('confirmedEntitlements', () => {
  it('takes the status and folio from the confirmation and keeps the passes', () => {
    const entitlements: RegistrationEntitlements = {
      registration: {
        id: 'reg-1',
        status: 'pending_payment',
        folio: null,
        channel: 'in_person',
        participant: { fullName: 'Ana López', stageName: null },
      },
      passes: [pass('a', 30000, ['act-1'])],
      accessibleActivityIds: ['act-1'],
    };
    const confirmation: CashConfirmation = {
      registrationId: 'reg-1',
      eventId: 'event-1',
      status: 'confirmed',
      folio: 'LMP-7K3Q',
      auditId: 'audit-1',
    };
    expect(confirmedEntitlements(entitlements, confirmation)).toEqual({
      ...entitlements,
      registration: { ...entitlements.registration, status: 'confirmed', folio: 'LMP-7K3Q' },
    });
  });
});

describe('registrationViewMode', () => {
  it('allows the sale only while the registration is pending payment', () => {
    expect(registrationStatuses.map(registrationViewMode)).toEqual(['sale', 'confirmed', 'voided']);
  });
});

describe('selectionSummary', () => {
  const activities = [activity('act-1', 'Breaking 1 vs 1'), activity('act-2', 'Popping')];

  it('names the selected competitions in the saved order', () => {
    expect(selectionSummary(['act-2', 'act-1'], activities)).toBe('Popping, Breaking 1 vs 1');
  });

  it('marks a selection the catalog no longer lists', () => {
    expect(selectionSummary(['act-1', 'act-9'], activities)).toBe(
      'Breaking 1 vs 1, Competencia no disponible',
    );
  });

  it('counts the selections when the activities could not be read', () => {
    expect(selectionSummary(['act-1'], null)).toBe('1 competencia');
    expect(selectionSummary(['act-1', 'act-2'], null)).toBe('2 competencias');
  });

  it('says when a pass has no competitions', () => {
    expect(selectionSummary([], activities)).toBe('Sin competencias');
  });
});
