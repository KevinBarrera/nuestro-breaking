import {
  adminRegistrationFailure,
  setPassSelections,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { FieldError, Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  reviewSelectionChange,
  selectionChangeFailure,
  selectionChangeRows,
  type SelectionChangeFailure,
} from './confirmed-competitions-model';
import { CorrectionDialog, OptionCheckbox, ReasonField, ReloadAlert } from './correction-dialog';
import { toggleCompetition, type SaleCompetitionPass } from './sale-competitions-model';

type CompetitionsDialogProps = {
  eventId: string;
  registrationId: string;
  pass: SaleCompetitionPass;
  onSaved: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
  onClose: () => void;
};

type Sent = { activityIds: string[]; reason: string };

// "Editar competencias" of one held pass on a confirmed registration (#170, #345): the new list
// and the required reason, reviewed before the PUT. A failure keeps the draft; one that needs a
// reload only offers "Recargar", so a lost answer is never sent twice.
export function CompetitionsDialog({
  eventId,
  registrationId,
  pass,
  onSaved,
  onReload,
  onClose,
}: CompetitionsDialogProps) {
  const formId = useId();
  const reasonId = `${formId}-reason`;
  const selectionErrorId = `${formId}-selection-error`;
  const [draft, setDraft] = useState<readonly string[]>(pass.saved);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [failure, setFailure] = useState<SelectionChangeFailure | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second PUT from a fast double click.
  const sending = useRef(false);
  // Set when a rejected reason sends the operator back to the form.
  const [focusReason, setFocusReason] = useState(0);
  useEffect(() => {
    if (focusReason) document.getElementById(reasonId)?.focus();
  }, [focusReason, reasonId]);

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = reviewSelectionChange(pass, draft, reason);
    setFailure(null);
    if (!checked.ok) {
      setReasonError(checked.reasonError);
      setSelectionError(checked.selectionError);
      if (checked.reasonError && !checked.selectionError) setFocusReason((count) => count + 1);
      return;
    }
    setSent({ activityIds: checked.activityIds, reason: checked.reason });
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    setPassSelections(eventId, registrationId, pass.registrationPassId, sent.activityIds, {
      reason: sent.reason,
    })
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((caught: unknown) => {
        const next = selectionChangeFailure(adminRegistrationFailure(caught));
        // A stale screen stays on the review with "Recargar"; anything else goes back to the form.
        if (next.reload) {
          setFailure(next);
          return;
        }
        setSent(null);
        if (next.field) {
          setReasonError(next.message);
          setFocusReason((count) => count + 1);
        } else setFailure(next);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  return (
    <CorrectionDialog
      title="Editar competencias"
      description={`De «${pass.name}». Marca las competencias en las que participa.`}
      formId={formId}
      reviewing={sent !== null}
      rows={sent ? selectionChangeRows(pass, draft) : []}
      reason={reason}
      reviewNote={
        failure?.reload && (
          <ReloadAlert
            message={failure.message}
            onReload={() => {
              onReload();
              onClose();
            }}
          />
        )
      }
      confirmLabel="Guardar competencias"
      pending={pending}
      locked={!!failure?.reload}
      onBack={() => setSent(null)}
      onConfirm={confirm}
      onClose={onClose}
    >
      <form
        id={formId}
        noValidate
        onSubmit={review}
        className="space-y-4"
        aria-label={`Editar competencias de «${pass.name}»`}
      >
        <fieldset
          aria-describedby={selectionError ? selectionErrorId : undefined}
          className="flex flex-col gap-0.5 rounded-lg border border-line p-1"
        >
          <legend className="sr-only">Competencias</legend>
          {pass.choices.map((choice) => (
            <OptionCheckbox
              key={choice.activityId}
              label={choice.name}
              note={choice.available ? undefined : 'Ya no está disponible para este pase.'}
              tag={pass.saved.includes(choice.activityId) ? 'Actual' : undefined}
              checked={draft.includes(choice.activityId)}
              disabled={!choice.available && !draft.includes(choice.activityId)}
              onChange={() => {
                setDraft((current) => toggleCompetition(current, choice.activityId));
                setSelectionError(undefined);
              }}
            />
          ))}
        </fieldset>
        {selectionError ? <FieldError id={selectionErrorId}>{selectionError}</FieldError> : null}
        <ReasonField
          id={reasonId}
          value={reason}
          placeholder="Ej. Pidió cambiar de competencia en mesa"
          error={reasonError}
          onChange={(value) => {
            setReason(value);
            setReasonError(undefined);
          }}
        />
        {failure && !failure.reload && <Notice tone="danger">{failure.message}</Notice>}
      </form>
    </CorrectionDialog>
  );
}
