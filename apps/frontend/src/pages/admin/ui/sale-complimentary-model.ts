import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  HeldPass,
} from '@/entities/admin-registration';
import { cashTotalCents } from './sale-cash-model';

// Confirmation without payment of the in-person sale (#263): golden tickets and guests hold only
// $0 passes, so there is nothing to charge. The backend checks the total again and stays the
// authority on every rule.

// A registration that holds passes totalling $0 is confirmed without payment instead of in cash.
export const isComplimentarySale = (passes: readonly HeldPass[]): boolean =>
  passes.length > 0 && cashTotalCents(passes) === 0;

export const reasonMaxLength = 500;

// The backend's reason limit, checked on the trimmed text before sending.
export function complimentaryReasonError(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (!trimmed) return 'Escribe el motivo de la confirmación sin cobro.';
  if (trimmed.length > reasonMaxLength) return `Usa máximo ${reasonMaxLength} caracteres.`;
  return undefined;
}

export const complimentaryReasonHint = (reason: string) =>
  `${reason.trim().length} de ${reasonMaxLength} caracteres.`;

// The confirmation cannot be undone from the panel and sends the email, so the operator checks it
// first.
export const complimentaryConfirmation = ({
  reason,
  participantName,
}: {
  reason: string;
  participantName: string;
}) => ({
  title: `¿Confirmar sin cobro la inscripción de ${participantName}?`,
  consequence: `Motivo: ${reason.trim()}. La inscripción quedará confirmada sin pago, con su folio, y se enviará el correo de confirmación.`,
});

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  no_passes: 'Esta inscripción ya no tiene pases. Recarga para ver su estado.',
  not_zero_total:
    'Esta inscripción ya tiene un monto a cobrar. Recarga para registrar el pago en efectivo.',
  registration_not_pending: 'Esta inscripción ya no está pendiente. Recarga para ver su estado.',
  registration_voided: 'Esta inscripción está anulada. Recarga para ver su estado.',
};

export type ComplimentaryFailure = { field: 'reason' | null; message: string; reload: boolean };

// The inline message of a failed confirmation. Every rule means the screen is stale, and a lost
// answer may have confirmed the registration, so both only offer "Recargar".
export function confirmComplimentaryFailure(
  failure: AdminRegistrationFailure,
): ComplimentaryFailure {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        field: null,
        message: 'Sin acceso: tu cuenta no puede confirmar inscripciones en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        field: null,
        message:
          'No pudimos saber si la inscripción se confirmó. Recarga la inscripción antes de intentarlo de nuevo.',
        reload: true,
      };
    case 'rule':
      return { field: null, message: ruleMessages[failure.code] ?? staleMessage, reload: true };
    case 'invalid':
      if (failure.fieldErrors.reason)
        return {
          field: 'reason',
          message: `Escribe un motivo de 1 a ${reasonMaxLength} caracteres.`,
          reload: false,
        };
      return { field: null, message: 'Revisa el motivo de la confirmación.', reload: false };
    case 'not_found':
      return {
        field: null,
        message: 'No encontramos esta inscripción. Recarga para ver los datos actuales.',
        reload: true,
      };
    default:
      return {
        field: null,
        message: 'No pudimos confirmar la inscripción. Intenta de nuevo.',
        reload: false,
      };
  }
}
