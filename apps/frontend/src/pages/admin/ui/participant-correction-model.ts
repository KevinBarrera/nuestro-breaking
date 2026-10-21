import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  ParticipantCorrectionInput,
  RegistrationSummary,
} from '@/entities/admin-registration';
import { emptyParticipantForm, validateParticipant } from '@/entities/participant';
import { registrationServerErrors } from './registration-model';
import { reasonMaxLength } from './sale-complimentary-model';
import { defaultSalePhoneMode, saleParticipantMessages } from './sale-participant-model';

// Correcting the participant's name parts and AKA on one registration (#104). The reason goes to
// the `registration_correction` audit fact; other events of the same person never change. The
// backend checks every rule again and stays the authority.

export const correctionFields = [
  'firstName',
  'firstLastName',
  'secondLastName',
  'stageName',
] as const;
export type CorrectionField = (typeof correctionFields)[number];
export type CorrectionForm = Record<CorrectionField, string>;
export type CorrectionErrors = Partial<Record<CorrectionField, string>>;

// A voided registration is read-only; pending and confirmed ones, online or in person, can be
// corrected.
export const canCorrectParticipant = ({ status }: RegistrationSummary): boolean =>
  status !== 'voided';

// A legacy participant only has its full name. Splitting it would guess wrong on compound names,
// so its parts start empty and the required errors ask for them on save; the hint explains why.
export function initialCorrectionForm({ participant }: RegistrationSummary): CorrectionForm {
  return {
    firstName: participant.firstName ?? '',
    firstLastName: participant.firstLastName ?? '',
    secondLastName: participant.secondLastName ?? '',
    stageName: participant.stageName ?? '',
  };
}

export const legacyNameHint = ({ participant }: RegistrationSummary): string | null =>
  participant.firstName === null
    ? `Esta inscripción guardó el nombre completo (${participant.fullName}) sin separarlo: escribe el nombre y los apellidos por separado.`
    : null;

// Trimmed with inner spaces collapsed, as the backend stores it.
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

// The sale form's limits and copy: first name and first last name required, every part up to 100.
export function correctionErrors(form: CorrectionForm): CorrectionErrors {
  const normalized = Object.fromEntries(
    correctionFields.map((field) => [field, normalize(form[field])]),
  ) as CorrectionForm;
  const errors = validateParticipant({ ...emptyParticipantForm, ...normalized }, '', {
    messages: saleParticipantMessages(defaultSalePhoneMode),
    phoneIsValid: () => true,
  });
  const result: CorrectionErrors = {};
  for (const field of correctionFields) if (errors[field]) result[field] = errors[field];
  return result;
}

// The backend's reason limit, checked on the trimmed text before sending.
export function correctionReasonError(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (!trimmed) return 'Escribe el motivo de la corrección.';
  if (trimmed.length > reasonMaxLength) return `Usa máximo ${reasonMaxLength} caracteres.`;
  return undefined;
}

export const correctionReasonHint = (reason: string) =>
  `Queda en el historial. ${reason.trim().length} de ${reasonMaxLength} caracteres.`;

// The backend rejects a correction that changes nothing, so the form says so before sending.
export const correctionHasChanges = (form: CorrectionForm, summary: RegistrationSummary) => {
  const current = initialCorrectionForm(summary);
  return correctionFields.some((field) => normalize(form[field]) !== normalize(current[field]));
};

// All four parts are sent, blank ones included, so a cleared part is cleared on purpose.
export const correctionInput = (
  form: CorrectionForm,
  reason: string,
): ParticipantCorrectionInput => ({
  firstName: form.firstName.trim(),
  firstLastName: form.firstLastName.trim(),
  secondLastName: form.secondLastName.trim(),
  stageName: form.stageName.trim(),
  reason: reason.trim(),
});

export const crossEventWarning = (otherEventCount: number) =>
  `Esta persona aparece en ${otherEventCount} ${otherEventCount === 1 ? 'evento' : 'eventos'} más. Esos registros no cambian.`;

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  correction_no_changes:
    'La inscripción ya tiene ese nombre y AKA. Recarga para ver los datos actuales.',
  registration_voided:
    'Esta inscripción se anuló y ya no se puede corregir. Recarga para ver su estado.',
};

export type CorrectionFailure = {
  fields: Partial<Record<CorrectionField | 'reason', string>>;
  message: string;
  reload: boolean;
};

const isCorrectionField = (field: string): field is CorrectionField =>
  correctionFields.some((known) => known === field);

// The message of a failed correction. A rule answer means the screen is stale, and a lost answer
// may have saved the correction, so both only offer "Recargar" and are never retried blindly.
export function correctionFailure(failure: AdminRegistrationFailure): CorrectionFailure {
  const plain = (message: string, reload = false): CorrectionFailure => ({
    fields: {},
    message,
    reload,
  });
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return plain('Sin acceso: tu cuenta no puede corregir inscripciones en este evento.');
    case 'unknown':
      return plain(
        'No pudimos confirmar si la corrección se guardó. Recarga la inscripción antes de intentarlo de nuevo.',
        true,
      );
    case 'rule':
      return plain(ruleMessages[failure.code] ?? staleMessage, true);
    case 'cross_event':
      return plain(crossEventWarning(failure.otherEventCount));
    case 'not_found':
      return plain(
        'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
        true,
      );
    case 'invalid': {
      const { reason, ...names } = failure.fieldErrors;
      const { errors, unmapped } = registrationServerErrors(names, defaultSalePhoneMode);
      const fields: CorrectionFailure['fields'] = {};
      for (const [field, message] of Object.entries(errors))
        if (isCorrectionField(field)) fields[field] = message;
      if (reason) fields.reason = `Escribe un motivo de 1 a ${reasonMaxLength} caracteres.`;
      const message =
        unmapped || Object.keys(fields).length === 0
          ? 'No pudimos guardar la corrección. Revisa los datos e intenta de nuevo.'
          : 'Revisa los datos marcados.';
      return { fields, message, reload: false };
    }
    default:
      return plain('No pudimos guardar la corrección. Intenta de nuevo.');
  }
}
