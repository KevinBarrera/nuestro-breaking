import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  RegistrationSummary,
} from '@/entities/admin-registration';
import { reasonMaxLength } from './sale-complimentary-model';

// Voiding a mistaken in-person registration that is still pending payment (#104). The reason goes
// to the `registration_void` audit fact; the backend checks every rule again and stays the
// authority.

// Online registrations expire on their own, so voiding one could leave a live checkout behind.
export const canVoidRegistration = ({ status, channel }: RegistrationSummary): boolean =>
  status === 'pending_payment' && channel === 'in_person';

// The backend's reason limit, checked on the trimmed text before sending.
export function voidReasonError(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (!trimmed) return 'Escribe el motivo de la anulación.';
  if (trimmed.length > reasonMaxLength) return `Usa máximo ${reasonMaxLength} caracteres.`;
  return undefined;
}

export const voidReasonHint = (reason: string) =>
  `Queda en el historial. ${reason.trim().length} de ${reasonMaxLength} caracteres.`;

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_not_pending:
    'Esta inscripción ya no está pendiente de pago: ya se confirmó o se anuló. Recarga para ver su estado.',
  registration_voided: 'Esta inscripción ya está anulada. Recarga para ver su estado.',
  online_registration_void_locked:
    'Esta inscripción se hizo en línea y no se puede anular: se cancela sola si no se paga a tiempo.',
};

export type VoidFailure = { field: 'reason' | null; message: string; reload: boolean };

// The message of a failed void. A rule answer means the screen is stale, and a lost answer may
// have voided the registration, so both only offer "Recargar" and are never retried blindly.
export function voidRegistrationFailure(failure: AdminRegistrationFailure): VoidFailure {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        field: null,
        message: 'Sin acceso: tu cuenta no puede anular inscripciones en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        field: null,
        message:
          'No pudimos confirmar si la inscripción se anuló. Recarga la inscripción antes de intentarlo de nuevo.',
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
      return { field: null, message: 'Revisa el motivo de la anulación.', reload: false };
    case 'not_found':
      return {
        field: null,
        message:
          'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
        reload: true,
      };
    default:
      return {
        field: null,
        message: 'No pudimos anular la inscripción. Intenta de nuevo.',
        reload: false,
      };
  }
}
