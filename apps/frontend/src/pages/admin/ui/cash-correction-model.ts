import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  CashCorrectionInput,
  CashPayment,
  HeldPass,
  RegistrationSummary,
} from '@/entities/admin-registration';
import { centsToInput, formatMxn, parseMxnToCents } from '@/entities/event-catalog';
import { correctionReasonError } from './participant-correction-model';
import { cashFormErrors, cashTotalCents, receiptTakenMessage } from './sale-cash-model';
import { reasonMaxLength } from './sale-complimentary-model';

// Correcting the amount and/or paper receipt number of a confirmed cash payment (#104), after the
// administrator checked the original receipt. The reason goes to the `cash_correction` audit fact,
// which keeps the previous values. The backend checks every rule again and stays the authority.

export type CashCorrectionForm = {
  // Pesos, as the pass price form takes them: "750", "750.5" or "750,50".
  amount: string;
  receipt: string;
  reason: string;
  receiptChecked: boolean;
};
export type CashCorrectionField = keyof CashCorrectionForm;
export type CashCorrectionErrors = Partial<Record<CashCorrectionField, string>>;

// Only a confirmed registration whose payment was recorded in cash; Mercado Pago and
// complimentary confirmations have no cash payment.
export const canCorrectCash = ({ status, cash }: RegistrationSummary): boolean =>
  status === 'confirmed' && cash !== null;

// A legacy confirmation has no receipt (#125); the correction can give it one.
export const initialCashCorrectionForm = (cash: CashPayment): CashCorrectionForm => ({
  amount: centsToInput(cash.amountCents),
  receipt: cash.receipt ?? '',
  reason: '',
  receiptChecked: false,
});

const amountMessage =
  'Escribe un monto válido en pesos, sin separadores de miles y con hasta 2 decimales, por ejemplo 1500 o 1500,50.';
const receiptCheckMessage = 'Confirma que revisaste el recibo original antes de corregir.';

export type CashCorrectionReview =
  | { ok: true; input: CashCorrectionInput }
  | { ok: false; errors: CashCorrectionErrors; unchanged?: string };

// The backend's limits, checked before the confirmation dialog: any amount above zero (it may
// differ from the pass total), a receipt of 1 to 50 characters once trimmed, the reason and the
// receipt check. A correction that changes nothing is rejected by the backend, so it is caught here.
export function reviewCashCorrection(
  form: CashCorrectionForm,
  cash: CashPayment,
): CashCorrectionReview {
  const errors: CashCorrectionErrors = {};
  const amountCents = parseMxnToCents(form.amount);
  if (amountCents === null) errors.amount = amountMessage;
  else if (amountCents === 0) errors.amount = 'El monto debe ser mayor que $0.';
  const receiptError = cashFormErrors({ receipt: form.receipt, note: '' }).receipt;
  if (receiptError) errors.receipt = receiptError;
  const reasonError = correctionReasonError(form.reason);
  if (reasonError) errors.reason = reasonError;
  if (!form.receiptChecked) errors.receiptChecked = receiptCheckMessage;
  if (Object.keys(errors).length > 0 || amountCents === null) return { ok: false, errors };
  const receipt = form.receipt.trim();
  if (amountCents === cash.amountCents && receipt === cash.receipt)
    return {
      ok: false,
      errors: {},
      unchanged: 'No hay cambios: el monto y el recibo son los mismos.',
    };
  return {
    ok: true,
    input: { amountCents, receipt, reason: form.reason.trim(), receiptChecked: true },
  };
}

// A different amount is allowed (#104), but the operator sees the pass total before confirming.
// Null while the typed amount is not readable.
export function passTotalWarning(
  amountCents: number | null,
  passes: readonly HeldPass[],
): string | null {
  const total = cashTotalCents(passes);
  return amountCents === null || amountCents === total
    ? null
    : `El monto no coincide con el total de los pases (${formatMxn(total)}).`;
}

export const cashReasonHint = (reason: string) =>
  `Queda en el historial. ${reason.trim().length} de ${reasonMaxLength} caracteres.`;

// The dialog restates the previous and new values before the POST.
export function cashCorrectionConfirmation(
  cash: CashPayment,
  input: CashCorrectionInput,
  participantName: string,
  warning: string | null,
) {
  const amount =
    input.amountCents === cash.amountCents
      ? `Monto: ${formatMxn(cash.amountCents)} (sin cambio).`
      : `Monto: ${formatMxn(cash.amountCents)} → ${formatMxn(input.amountCents)}.`;
  const receipt =
    input.receipt === cash.receipt
      ? `Recibo: ${input.receipt} (sin cambio).`
      : `Recibo: ${cash.receipt ?? 'sin número'} → ${input.receipt}.`;
  return {
    title: `¿Corregir el pago de ${participantName}?`,
    consequence: [amount, receipt, warning, 'La corrección queda en el historial con su motivo.']
      .filter(Boolean)
      .join(' '),
  };
}

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_voided:
    'Esta inscripción se anuló y ya no se puede corregir. Recarga para ver su estado.',
  cash_correction_not_cash:
    'Esta inscripción no tiene un pago en efectivo. Recarga para ver su estado.',
  correction_no_changes:
    'El pago ya tiene ese monto y recibo. Recarga para ver los datos actuales.',
};

export type CashCorrectionFailure = {
  fields: CashCorrectionErrors;
  message: string;
  reload: boolean;
};

// The message of a failed correction. A taken receipt stays on its field, as in the sale. A stale
// screen or a lost answer, which may have saved the correction, only offer "Recargar".
export function cashCorrectionFailure(failure: AdminRegistrationFailure): CashCorrectionFailure {
  const plain = (message: string, reload = false): CashCorrectionFailure => ({
    fields: {},
    message,
    reload,
  });
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return plain('Sin acceso: tu cuenta no puede corregir pagos en este evento.');
    case 'unknown':
      return plain(
        'No pudimos confirmar si la corrección se guardó. Recarga la inscripción antes de intentarlo de nuevo.',
        true,
      );
    case 'rule':
      if (failure.code === 'receipt_taken')
        return {
          fields: { receipt: receiptTakenMessage },
          message: 'Revisa los datos marcados.',
          reload: false,
        };
      return plain(ruleMessages[failure.code] ?? staleMessage, true);
    case 'not_found':
      return plain(
        'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
        true,
      );
    case 'invalid': {
      const { amountCents, receipt, reason, receiptChecked } = failure.fieldErrors;
      const fields: CashCorrectionErrors = {};
      if (amountCents) fields.amount = 'Escribe un monto mayor que $0, en pesos.';
      if (receipt) fields.receipt = 'Escribe un número de recibo de 1 a 50 caracteres.';
      if (reason) fields.reason = `Escribe un motivo de 1 a ${reasonMaxLength} caracteres.`;
      if (receiptChecked) fields.receiptChecked = receiptCheckMessage;
      const message =
        Object.keys(fields).length === 0
          ? 'No pudimos guardar la corrección. Revisa los datos e intenta de nuevo.'
          : 'Revisa los datos marcados.';
      return { fields, message, reload: false };
    }
    default:
      return plain('No pudimos guardar la corrección. Intenta de nuevo.');
  }
}
