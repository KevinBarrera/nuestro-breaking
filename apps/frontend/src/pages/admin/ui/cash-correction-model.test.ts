import { describe, expect, it } from 'vitest';
import type {
  AdminRegistrationFailure,
  HeldPass,
  RegistrationSummary,
} from '@/entities/admin-registration';
import {
  canCorrectCash,
  cashAmountHint,
  cashCorrectionRows,
  cashCorrectionFailure,
  initialCashCorrectionForm,
  reviewCashCorrection,
  type CashCorrectionForm,
} from './cash-correction-model';

const cash = { amountCents: 80000, receipt: 'A-17' };

const summary = (overrides: Partial<RegistrationSummary> = {}): RegistrationSummary => ({
  id: 'reg-1',
  status: 'confirmed',
  folio: 'LMP-7K3Q',
  channel: 'in_person',
  cash,
  participant: {
    fullName: 'Ana López',
    firstName: 'Ana',
    firstLastName: 'López',
    secondLastName: null,
    stageName: null,
  },
  ...overrides,
});

const pass = (priceCents: number): HeldPass => ({
  registrationPassId: `pass-${priceCents}`,
  passTypeId: `type-${priceCents}`,
  name: 'Pase completo',
  passClass: 'full',
  priceCents,
  selections: [],
});

const form = (overrides: Partial<CashCorrectionForm> = {}): CashCorrectionForm => ({
  amount: '750.00',
  receipt: ' A-18 ',
  reason: '  Recibo mal capturado ',
  receiptChecked: true,
  ...overrides,
});

describe('canCorrectCash', () => {
  it('offers the correction only on a confirmed registration paid in cash', () => {
    expect(canCorrectCash(summary())).toBe(true);
    expect(canCorrectCash(summary({ cash: { amountCents: 1, receipt: null } }))).toBe(true);
    expect(canCorrectCash(summary({ cash: null }))).toBe(false);
    expect(canCorrectCash(summary({ status: 'voided' }))).toBe(false);
    expect(canCorrectCash(summary({ status: 'pending_payment', folio: null }))).toBe(false);
  });
});

describe('initialCashCorrectionForm', () => {
  it('starts from the current amount in pesos and the receipt, unchecked and without reason', () => {
    expect(initialCashCorrectionForm(cash)).toEqual({
      amount: '800.00',
      receipt: 'A-17',
      reason: '',
      receiptChecked: false,
    });
  });

  it('leaves the receipt empty on a legacy confirmation without one', () => {
    expect(initialCashCorrectionForm({ amountCents: 12345, receipt: null })).toEqual({
      amount: '123.45',
      receipt: '',
      reason: '',
      receiptChecked: false,
    });
  });
});

describe('reviewCashCorrection', () => {
  it('builds the trimmed input in cents', () => {
    expect(reviewCashCorrection(form(), cash)).toEqual({
      ok: true,
      input: {
        amountCents: 75000,
        receipt: 'A-18',
        reason: 'Recibo mal capturado',
        receiptChecked: true,
      },
    });
    expect(reviewCashCorrection(form({ amount: '1500,5', receipt: 'A-17' }), cash)).toMatchObject({
      ok: true,
      input: { amountCents: 150050, receipt: 'A-17' },
    });
  });

  it('marks every invalid field', () => {
    expect(
      reviewCashCorrection(
        form({ amount: '1,500', receipt: '  ', reason: ' ', receiptChecked: false }),
        cash,
      ),
    ).toEqual({
      ok: false,
      errors: {
        amount:
          'Escribe un monto válido en pesos, sin separadores de miles y con hasta 2 decimales, por ejemplo 1500 o 1500,50.',
        receipt: 'Escribe el número del recibo en papel.',
        reason: 'Escribe el motivo. Queda en el historial.',
        receiptChecked: 'Confirma que revisaste el recibo antes de corregir.',
      },
    });
    expect(
      reviewCashCorrection(
        form({ amount: '0', receipt: 'x'.repeat(51), reason: 'x'.repeat(501) }),
        cash,
      ),
    ).toEqual({
      ok: false,
      errors: {
        amount: 'El monto debe ser mayor que $0.',
        receipt: 'Usa máximo 50 caracteres.',
        reason: 'Usa máximo 500 caracteres.',
      },
    });
  });

  it('says so when nothing changes, comparing the parsed amount and trimmed receipt', () => {
    expect(reviewCashCorrection(form({ amount: '800', receipt: ' A-17 ' }), cash)).toEqual({
      ok: false,
      errors: {},
      unchanged: 'No hay cambios que guardar. Modifica algo o cancela.',
    });
  });

  it('lets a legacy confirmation get its first receipt', () => {
    expect(
      reviewCashCorrection(form({ amount: '800' }), { amountCents: 80000, receipt: null }),
    ).toMatchObject({ ok: true, input: { amountCents: 80000, receipt: 'A-18' } });
  });
});

describe('cashAmountHint', () => {
  it('compares the typed amount with the sum of the held passes, without blocking', () => {
    const passes = [pass(50000), pass(30000)];
    expect(cashAmountHint(80000, passes)).toEqual({
      tone: 'success',
      text: 'Coincide con el total de los pases.',
    });
    expect(cashAmountHint(75000, passes)).toEqual({
      tone: 'warning',
      text: 'No coincide con el total de los pases ($800.00). Puedes guardarlo si así dice el recibo.',
    });
    expect(cashAmountHint(null, passes)).toBeNull();
  });
});

describe('cashCorrectionRows', () => {
  const input = { amountCents: 75000, receipt: 'A-18', reason: 'Motivo', receiptChecked: true };

  it('lists the changed values before and after', () => {
    expect(cashCorrectionRows(cash, input)).toEqual([
      { key: 'amount', label: 'Monto', before: '$800.00', after: '$750.00' },
      { key: 'receipt', label: 'Número de recibo', before: 'A-17', after: 'A-18' },
    ]);
  });

  it('leaves out an unchanged value and names a legacy receipt', () => {
    expect(cashCorrectionRows({ amountCents: 75000, receipt: null }, input)).toEqual([
      { key: 'receipt', label: 'Número de recibo', before: 'Sin número', after: 'A-18' },
    ]);
  });
});

describe('cashCorrectionFailure', () => {
  const failure = (reported: AdminRegistrationFailure) => cashCorrectionFailure(reported);

  it('marks a taken receipt on its field, without a reload', () => {
    expect(failure({ kind: 'rule', code: 'receipt_taken' })).toEqual({
      fields: {
        receipt:
          'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
      },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
  });

  it('maps rejected fields to the form', () => {
    expect(
      failure({
        kind: 'invalid',
        fieldErrors: { amountCents: 'invalid', receipt: 'too_long', reason: 'invalid' },
      }),
    ).toEqual({
      fields: {
        amount: 'Escribe un monto mayor que $0, en pesos.',
        receipt: 'Escribe un número de recibo de 1 a 50 caracteres.',
        reason: 'Escribe un motivo de 1 a 500 caracteres.',
      },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
    expect(failure({ kind: 'invalid', fieldErrors: { receiptChecked: 'required' } })).toEqual({
      fields: { receiptChecked: 'Confirma que revisaste el recibo antes de corregir.' },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
    expect(failure({ kind: 'invalid', fieldErrors: { other: 'unknown_field' } })).toEqual({
      fields: {},
      message: 'No pudimos guardar la corrección. Revisa los datos e intenta de nuevo.',
      reload: false,
    });
  });

  it('locks the form behind "Recargar" when the screen is stale or the answer was lost', () => {
    for (const reported of [
      { kind: 'rule', code: 'registration_voided' },
      { kind: 'rule', code: 'cash_correction_not_cash' },
      { kind: 'rule', code: 'correction_no_changes' },
      { kind: 'not_found' },
      { kind: 'unknown' },
    ] as const)
      expect(failure(reported)).toMatchObject({ fields: {}, reload: true });
    expect(failure({ kind: 'unknown' }).message).toBe(
      'No pudimos confirmar si la corrección se guardó. Recarga la inscripción antes de intentarlo de nuevo.',
    );
    expect(failure({ kind: 'rule', code: 'cash_correction_not_cash' }).message).toBe(
      'Esta inscripción no tiene un pago en efectivo. Recarga para ver su estado.',
    );
  });

  it('keeps access and generic errors in the form', () => {
    expect(failure({ kind: 'forbidden' })).toEqual({
      fields: {},
      message: 'Sin acceso: tu cuenta no puede corregir pagos en este evento.',
      reload: false,
    });
    expect(failure({ kind: 'error' })).toEqual({
      fields: {},
      message: 'No pudimos guardar la corrección. Intenta de nuevo.',
      reload: false,
    });
  });
});
