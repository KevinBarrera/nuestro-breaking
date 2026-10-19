import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  CashConfirmation,
  CashPaymentInput,
  HeldPass,
  RegistrationEntitlements,
  RegistrationStatus,
} from '@/entities/admin-registration';
import { formatMxn, type CatalogActivity } from '@/entities/event-catalog';

// Cash confirmation of the in-person sale (#105) and the screen each registration status gets.
// The UI computes the amount but the backend stays the authority on every rule.

// The sum of the held passes' prices; cash carries no service charge (product owner, 2026-10-16).
export const cashTotalCents = (passes: readonly HeldPass[]): number =>
  passes.reduce((total, pass) => total + pass.priceCents, 0);

// Why the payment cannot be recorded yet, or null. The backend requires an amount above zero, so
// a registration holding only free passes cannot be confirmed until #263 decides how.
export function cashUnavailableReason(passes: readonly HeldPass[]): string | null {
  if (passes.length === 0) return 'Agrega al menos un pase antes de registrar el pago.';
  if (cashTotalCents(passes) <= 0)
    return 'Esta inscripción no tiene monto a cobrar. La confirmación sin pago todavía no está disponible.';
  return null;
}

export const receiptMaxLength = 50;
export const noteMaxLength = 500;

export type CashForm = { receipt: string; note: string };
export type CashErrors = Partial<Record<keyof CashForm, string>>;

// The backend's receipt and note limits, checked on the trimmed text before sending.
export function cashFormErrors({ receipt, note }: CashForm): CashErrors {
  const errors: CashErrors = {};
  const trimmed = receipt.trim();
  if (!trimmed) errors.receipt = 'Escribe el número del recibo en papel.';
  else if (trimmed.length > receiptMaxLength)
    errors.receipt = `Usa máximo ${receiptMaxLength} caracteres.`;
  if (note.trim().length > noteMaxLength) errors.note = `Usa máximo ${noteMaxLength} caracteres.`;
  return errors;
}

// A blank note is left out: the backend rejects an empty optional field.
export function cashPaymentInput(passes: readonly HeldPass[], form: CashForm): CashPaymentInput {
  const input: CashPaymentInput = {
    amountCents: cashTotalCents(passes),
    receipt: form.receipt.trim(),
  };
  const note = form.note.trim();
  if (note) input.note = note;
  return input;
}

// The payment cannot be undone from the panel (#104), so the operator checks it first.
export const cashConfirmation = ({
  totalCents,
  receipt,
  participantName,
}: {
  totalCents: number;
  receipt: string;
  participantName: string;
}) => ({
  title: `¿Confirmar el pago de ${formatMxn(totalCents)}?`,
  consequence: `Recibo ${receipt.trim()} de ${participantName}. La inscripción quedará confirmada con su folio y el pago no se podrá corregir desde esta pantalla.`,
});

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_not_pending:
    'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
  registration_voided: 'Esta inscripción está anulada. Recarga para ver su estado.',
};

export type CashFailure = { field: 'receipt' | null; message: string; reload: boolean };

// The inline message of a failed confirmation. A lost answer may have confirmed the payment, so
// it only offers "Recargar"; sending it again could record the cash twice.
export function confirmCashFailure(failure: AdminRegistrationFailure): CashFailure {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        field: null,
        message: 'Sin acceso: tu cuenta no puede registrar pagos en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        field: null,
        message:
          'No pudimos confirmar si el pago se registró. Recarga la inscripción antes de intentarlo de nuevo.',
        reload: true,
      };
    case 'rule':
      if (failure.code === 'receipt_taken')
        return {
          field: 'receipt',
          message:
            'Ese número de recibo ya está registrado en este evento. Revisa el recibo en papel.',
          reload: false,
        };
      return { field: null, message: ruleMessages[failure.code] ?? staleMessage, reload: true };
    case 'invalid':
      if (failure.fieldErrors.receipt)
        return {
          field: 'receipt',
          message: 'Escribe un número de recibo de 1 a 50 caracteres.',
          reload: false,
        };
      if (failure.fieldErrors.amountCents)
        return {
          field: null,
          message: 'El total ya no es válido. Recarga para ver los pases actuales.',
          reload: true,
        };
      return { field: null, message: 'Revisa los datos del pago.', reload: false };
    case 'not_found':
      return {
        field: null,
        message: 'No encontramos esta inscripción. Recarga para ver los datos actuales.',
        reload: true,
      };
    default:
      return {
        field: null,
        message: 'No pudimos registrar el pago. Intenta de nuevo.',
        reload: false,
      };
  }
}

// Confirming changes only the status and the folio, which the answer carries, so the screen
// switches to the confirmed view without another read.
export const confirmedEntitlements = (
  entitlements: RegistrationEntitlements,
  confirmation: CashConfirmation,
): RegistrationEntitlements => ({
  ...entitlements,
  registration: {
    ...entitlements.registration,
    status: confirmation.status,
    folio: confirmation.folio,
  },
});

// Only a pending registration can be sold to; the others are read-only.
export type RegistrationViewMode = 'sale' | 'confirmed' | 'voided';

const viewModes: Record<RegistrationStatus, RegistrationViewMode> = {
  pending_payment: 'sale',
  confirmed: 'confirmed',
  voided: 'voided',
};

export const registrationViewMode = (status: RegistrationStatus) => viewModes[status];

// The competitions a held pass selected, by name; a count when the activities are unreadable.
export function selectionSummary(
  selections: readonly string[],
  activities: readonly CatalogActivity[] | null,
): string {
  if (selections.length === 0) return 'Sin competencias';
  if (!activities)
    return selections.length === 1 ? '1 competencia' : `${selections.length} competencias`;
  const names = new Map(activities.map((activity) => [activity.id, activity.name]));
  return selections.map((id) => names.get(id) ?? 'Competencia no disponible').join(', ');
}
