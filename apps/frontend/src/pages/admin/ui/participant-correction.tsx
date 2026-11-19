import {
  adminRegistrationFailure,
  correctParticipant,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { participantMaxLength } from '@/entities/participant';
import { Notice, TextField } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CorrectionDialog, ReasonField, ReloadAlert } from './correction-dialog';
import {
  correctionErrors,
  correctionFailure,
  correctionFields,
  correctionHasChanges,
  correctionInput,
  correctionReasonError,
  correctionRows,
  crossEventWarning,
  initialCorrectionForm,
  legacyNameHint,
  noChangesMessage,
  type CorrectionFailure,
  type CorrectionField,
  type CorrectionForm,
} from './participant-correction-model';

type ParticipantCorrectionDialogProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  onCorrected: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
  onClose: () => void;
};

type Errors = Partial<Record<CorrectionField | 'reason', string>>;

const fieldLabels: Record<CorrectionField, string> = {
  firstName: 'Nombre(s)',
  firstLastName: 'Primer apellido',
  secondLastName: 'Segundo apellido',
  stageName: 'AKA',
};

const optionalFields: readonly CorrectionField[] = ['secondLastName', 'stageName'];

// "Corregir nombre o AKA" (#104, #345): the participant's name parts and AKA on a pending or
// confirmed registration, with a required reason, reviewed before the POST. When the person has
// registrations in other events the backend asks to confirm first; the review says so and its
// action confirms. A failure that needs a reload only offers "Recargar".
export function ParticipantCorrectionDialog({
  eventId,
  entitlements,
  onCorrected,
  onReload,
  onClose,
}: ParticipantCorrectionDialogProps) {
  const formId = useId();
  const { registration } = entitlements;
  const [form, setForm] = useState<CorrectionForm>(() => initialCorrectionForm(registration));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<CorrectionFailure | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [otherEventCount, setOtherEventCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const fieldId = (field: CorrectionField | 'reason') => `${formId}-${field}`;
  // A field to focus once the form has rendered, e.g. after going back from the review.
  const [focusTarget, setFocusTarget] = useState<{ field: CorrectionField | 'reason' } | null>(
    null,
  );
  const focusField = (field: CorrectionField | 'reason') => setFocusTarget({ field });
  useEffect(() => {
    if (focusTarget) document.getElementById(fieldId(focusTarget.field))?.focus();
    // `fieldId` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Errors = { ...correctionErrors(form) };
    const reasonError = correctionReasonError(reason);
    if (reasonError) next.reason = reasonError;
    setErrors(next);
    setFailure(null);
    const first = [...correctionFields, 'reason' as const].find((key) => next[key]);
    if (first) {
      setNotice(null);
      focusField(first);
      return;
    }
    if (!correctionHasChanges(form, registration)) {
      setNotice(noChangesMessage);
      return;
    }
    setNotice(null);
    setReviewing(true);
  };

  const confirm = () => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setFailure(null);
    const confirmCrossEvent = otherEventCount !== null;
    correctParticipant(
      eventId,
      registration.id,
      correctionInput(form, reason),
      confirmCrossEvent ? { confirmCrossEvent: true } : {},
    )
      .then((next) => {
        onCorrected(next);
        onClose();
      })
      .catch((caught: unknown) => {
        const reported = adminRegistrationFailure(caught);
        if (reported.kind === 'cross_event' && !confirmCrossEvent) {
          setOtherEventCount(reported.otherEventCount);
          return;
        }
        const next = correctionFailure(reported);
        setFailure(next);
        // A stale screen stays on the review with "Recargar"; anything else goes back to the form.
        if (next.reload) return;
        setErrors(next.fields);
        setOtherEventCount(null);
        setReviewing(false);
        const first = [...correctionFields, 'reason' as const].find((key) => next.fields[key]);
        if (first) focusField(first);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  const hint = legacyNameHint(registration);

  return (
    <CorrectionDialog
      title="Corregir nombre o AKA"
      description="Corrige errores de captura. Solo cambia esta inscripción."
      formId={formId}
      reviewing={reviewing}
      rows={reviewing ? correctionRows(registration, form) : []}
      reason={reason}
      reviewNote={
        <>
          {otherEventCount !== null && (
            <Notice title="Esta persona está en otros eventos">
              {crossEventWarning(otherEventCount)} La corrección solo se guarda en esta inscripción.
            </Notice>
          )}
          {failure?.reload && (
            <ReloadAlert
              message={failure.message}
              onReload={() => {
                onReload();
                onClose();
              }}
            />
          )}
        </>
      }
      confirmLabel={otherEventCount !== null ? 'Confirmar corrección' : 'Guardar corrección'}
      pending={pending}
      locked={!!failure?.reload}
      onBack={() => {
        setOtherEventCount(null);
        setReviewing(false);
      }}
      onConfirm={confirm}
      onClose={onClose}
    >
      <form
        id={formId}
        noValidate
        onSubmit={review}
        className="space-y-4"
        aria-label="Corregir nombre o AKA"
      >
        {hint && <p className="text-sm text-fg">{hint}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {correctionFields.map((field) => (
            <TextField
              key={field}
              id={fieldId(field)}
              autoFocus={field === 'firstName'}
              label={fieldLabels[field]}
              optional={optionalFields.includes(field)}
              value={form[field]}
              maxLength={participantMaxLength[field]}
              autoComplete="off"
              error={errors[field]}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setForm((current) => ({ ...current, [field]: value }));
                setErrors((current) => ({ ...current, [field]: undefined }));
                setNotice(null);
              }}
            />
          ))}
        </div>
        <ReasonField
          id={fieldId('reason')}
          value={reason}
          placeholder="Ej. Error de dedo al capturar el nombre"
          error={errors.reason}
          onChange={(value) => {
            setReason(value);
            setErrors((current) => ({ ...current, reason: undefined }));
          }}
        />
        {notice && (
          <p role="alert" className="text-sm font-semibold text-danger-fg">
            {notice}
          </p>
        )}
        {failure && !failure.reload && <Notice tone="danger">{failure.message}</Notice>}
      </form>
    </CorrectionDialog>
  );
}
