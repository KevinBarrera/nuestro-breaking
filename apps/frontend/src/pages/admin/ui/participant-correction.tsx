import {
  adminRegistrationFailure,
  correctParticipant,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { participantFieldLabels, participantMaxLength } from '@/entities/participant';
import { buttonClass, Modal, Notice, TextField } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from 'react-aria-components';
import { styles } from './catalog-copy';
import {
  correctionErrors,
  correctionFailure,
  correctionFields,
  correctionHasChanges,
  correctionInput,
  correctionReasonError,
  correctionReasonHint,
  crossEventWarning,
  initialCorrectionForm,
  legacyNameHint,
  type CorrectionFailure,
  type CorrectionField,
  type CorrectionForm,
} from './participant-correction-model';
import { reasonMaxLength } from './sale-complimentary-model';

type ParticipantCorrectionProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  onCorrected: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

type Errors = Partial<Record<CorrectionField | 'reason', string>>;

const optionalFields: readonly CorrectionField[] = ['secondLastName', 'stageName'];

const noChangesMessage = 'No hay cambios: el nombre y el AKA son los mismos.';

// Corrects the participant's name parts and AKA on a pending or confirmed registration (#104),
// with a required reason. It starts collapsed so it never competes with the sale. When the person
// has registrations in other events the backend asks to confirm first; those never change. A
// failure that needs a reload locks the action, so a lost answer is never sent twice.
export function ParticipantCorrection({
  eventId,
  entitlements,
  onCorrected,
  onReload,
}: ParticipantCorrectionProps) {
  const titleId = useId();
  const formId = useId();
  const { registration } = entitlements;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CorrectionForm>(() => initialCorrectionForm(registration));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<CorrectionFailure | null>(null);
  const [otherEventCount, setOtherEventCount] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  // Set when the form closes, so focus goes back to the button that opened it, or to "Recargar"
  // when a stale screen has disabled that button.
  const restoreFocus = useRef(false);
  const locked = failure?.reload ?? false;
  const fieldId = (field: CorrectionField | 'reason') => `${formId}-${field}`;
  const focusField = (field: CorrectionField | 'reason') =>
    document.getElementById(fieldId(field))?.focus();

  useEffect(() => {
    if (open) focusField('firstName');
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      (locked ? reloadRef : toggleRef).current?.focus();
    }
    // `focusField` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openForm = () => {
    setForm(initialCorrectionForm(registration));
    setReason('');
    setErrors({});
    setNotice(null);
    setFailure(null);
    setSaved(false);
    setOpen(true);
  };

  const close = () => {
    restoreFocus.current = true;
    setOpen(false);
  };

  const send = (confirmCrossEvent: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setFailure(null);
    setNotice(null);
    correctParticipant(
      eventId,
      registration.id,
      correctionInput(form, reason),
      confirmCrossEvent ? { confirmCrossEvent: true } : {},
    )
      .then((next) => {
        setOtherEventCount(null);
        onCorrected(next);
        setSaved(true);
        close();
      })
      .catch((caught: unknown) => {
        const reported = adminRegistrationFailure(caught);
        if (reported.kind === 'cross_event' && !confirmCrossEvent) {
          setOtherEventCount(reported.otherEventCount);
          return;
        }
        setOtherEventCount(null);
        const next = correctionFailure(reported);
        setFailure(next);
        setErrors(next.fields);
        // A stale screen is explained next to "Recargar"; anything else stays in the form.
        if (next.reload) close();
        else {
          const first = [...correctionFields, 'reason' as const].find((key) => next.fields[key]);
          if (first) focusField(first);
        }
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
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
      focusField('firstName');
      return;
    }
    send(false);
  };

  const reload = () => {
    setFailure(null);
    onReload();
  };

  const hint = legacyNameHint(registration);

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Corregir nombre o AKA
      </h2>
      <p className="text-sm text-muted">
        Corrige errores de captura con un motivo. Solo cambia esta inscripción.
      </p>
      {saved && (
        <p role="status" className="text-sm font-semibold text-success-fg">
          Se guardó la corrección.
        </p>
      )}
      {failure?.reload && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>{failure.message}</p>
          <button
            ref={reloadRef}
            type="button"
            className={buttonClass('secondary')}
            onClick={reload}
          >
            Recargar
          </button>
        </div>
      )}
      {!open ? (
        <button
          ref={toggleRef}
          type="button"
          className={buttonClass('secondary')}
          disabled={locked}
          onClick={openForm}
        >
          Corregir nombre o AKA
        </button>
      ) : (
        <form noValidate onSubmit={submit} className="space-y-4" aria-label="Corregir nombre o AKA">
          {hint && <p className="text-sm text-fg">{hint}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {correctionFields.map((field) => (
              <TextField
                key={field}
                id={fieldId(field)}
                label={participantFieldLabels[field]}
                optional={optionalFields.includes(field)}
                value={form[field]}
                maxLength={participantMaxLength[field]}
                autoComplete="off"
                error={errors[field]}
                disabled={pending}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setForm((current) => ({ ...current, [field]: value }));
                  setErrors((current) => ({ ...current, [field]: undefined }));
                  setNotice(null);
                }}
              />
            ))}
          </div>
          <TextField
            id={fieldId('reason')}
            label="Motivo"
            hint={correctionReasonHint(reason)}
            value={reason}
            maxLength={reasonMaxLength}
            required
            error={errors.reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setErrors((current) => ({ ...current, reason: undefined }));
            }}
          />
          {notice && <Notice>{notice}</Notice>}
          {failure && !failure.reload && <Notice tone="danger">{failure.message}</Notice>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass('primary')} disabled={pending}>
              {pending && otherEventCount === null ? 'Guardando…' : 'Guardar corrección'}
            </button>
            <button
              type="button"
              className={buttonClass('secondary')}
              disabled={pending}
              onClick={close}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {otherEventCount !== null && (
        <CrossEventDialog
          participantName={registration.participant.fullName}
          otherEventCount={otherEventCount}
          isPending={pending}
          onClose={() => setOtherEventCount(null)}
          onConfirm={() => send(true)}
        />
      )}
    </section>
  );
}

type CrossEventDialogProps = {
  participantName: string;
  otherEventCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

// Modeled on Anular inscripción (#104): the person is in other events, which keep their data.
function CrossEventDialog({
  participantName,
  otherEventCount,
  isPending,
  onClose,
  onConfirm,
}: CrossEventDialogProps) {
  return (
    <Modal
      role="alertdialog"
      title={`¿Corregir el nombre de ${participantName}?`}
      isOpen
      onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button className={buttonClass('primary')} isDisabled={isPending} onPress={onConfirm}>
            {isPending ? 'Guardando…' : 'Confirmar corrección'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 pb-1 text-sm">
        <p>{crossEventWarning(otherEventCount)}</p>
        <p>La corrección solo se guarda en esta inscripción.</p>
      </div>
    </Modal>
  );
}
