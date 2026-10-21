import {
  adminRegistrationFailure,
  setPassSelections,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { buttonClass, CheckboxField, ConfirmDialog, FieldError } from '@/shared/ui';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  reviewSelectionChange,
  selectionChangeConfirmation,
  selectionChangeFailure,
  selectionReasonHint,
  type SelectionChangeFailure,
} from './confirmed-competitions-model';
import { toggleCompetition, type SaleCompetitionPass } from './sale-competitions-model';
import { reasonMaxLength } from './sale-complimentary-model';

type ConfirmedCompetitionsEditorProps = {
  eventId: string;
  registrationId: string;
  pass: SaleCompetitionPass;
  onSaved: (entitlements: RegistrationEntitlements) => void;
  onCancel: () => void;
  onReload: () => void;
};

type Sent = { activityIds: string[]; reason: string; title: string; consequence: string };

// The input keeps the 44px target; it mirrors the TextField frame.
const reasonFrame =
  'mt-1 block min-h-24 w-full rounded-lg border bg-input px-3 py-2 text-base text-fg placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus disabled:opacity-60';

// Changes one held pass's competitions on a confirmed registration (#170): the operator checks
// the new list, writes the required reason and confirms the change in a dialog, which alone sends
// the PUT. A failure keeps the draft; one that needs a reload locks saving, so a lost answer is
// never sent twice.
export function ConfirmedCompetitionsEditor({
  eventId,
  registrationId,
  pass,
  onSaved,
  onCancel,
  onReload,
}: ConfirmedCompetitionsEditorProps) {
  const reasonId = useId();
  const selectionErrorId = useId();
  const [draft, setDraft] = useState<readonly string[]>(pass.saved);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [selectionError, setSelectionError] = useState<string | undefined>();
  // `sent` outlives `open` so the dialog keeps its copy while it closes.
  const [sent, setSent] = useState<Sent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second PUT from a fast double click.
  const sending = useRef(false);
  const [failure, setFailure] = useState<SelectionChangeFailure | null>(null);
  const locked = failure?.reload ?? false;

  const toggle = (activityId: string) => {
    setDraft((current) => toggleCompetition(current, activityId));
    setSelectionError(undefined);
    if (failure && !failure.reload) setFailure(null);
  };

  const edit = (value: string) => {
    setReason(value);
    setReasonError(undefined);
    if (failure && !failure.reload) setFailure(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || pending) return;
    const checked = reviewSelectionChange(pass, draft, reason);
    if (!checked.ok) {
      setReasonError(checked.reasonError);
      setSelectionError(checked.selectionError);
      return;
    }
    setFailure(null);
    setSent({
      activityIds: checked.activityIds,
      reason: checked.reason,
      ...selectionChangeConfirmation(pass, draft, checked.reason),
    });
    setOpen(true);
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    setPassSelections(eventId, registrationId, pass.registrationPassId, sent.activityIds, {
      reason: sent.reason,
    })
      .then((updated) => {
        setOpen(false);
        onSaved(updated);
      })
      .catch((caught: unknown) => {
        const next = selectionChangeFailure(adminRegistrationFailure(caught));
        if (next.field) setReasonError(next.message);
        else setFailure(next);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
        setOpen(false);
      });
  };

  const reload = () => {
    setFailure(null);
    onReload();
  };

  const hintId = `${reasonId}-hint`;
  const errorId = `${reasonId}-error`;

  return (
    <form
      noValidate
      aria-label={`Editar competencias de «${pass.name}»`}
      className="basis-full space-y-4 rounded-lg bg-surface-inner p-4"
      onSubmit={review}
    >
      <fieldset aria-describedby={selectionError ? selectionErrorId : undefined}>
        <legend className="text-sm font-semibold text-fg">Competencias</legend>
        {pass.choices.map((choice) => (
          <CheckboxField
            key={choice.activityId}
            label={choice.name}
            description={choice.available ? undefined : 'Ya no está disponible para este pase.'}
            checked={draft.includes(choice.activityId)}
            disabled={pending || (!choice.available && !draft.includes(choice.activityId))}
            onChange={() => toggle(choice.activityId)}
          />
        ))}
        {selectionError ? <FieldError id={selectionErrorId}>{selectionError}</FieldError> : null}
      </fieldset>
      <div>
        <label htmlFor={reasonId} className="block text-sm font-semibold text-fg">
          Motivo del cambio
        </label>
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {selectionReasonHint(reason)}
        </p>
        <textarea
          id={reasonId}
          value={reason}
          rows={3}
          maxLength={reasonMaxLength}
          placeholder="Ej. El participante pidió cambiar de competencia en mesa"
          required
          disabled={pending}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? `${hintId} ${errorId}` : hintId}
          className={`${reasonFrame} ${reasonError ? 'border-danger-fg' : 'border-input-line'}`}
          onChange={(event) => edit(event.target.value)}
        />
        {reasonError ? <FieldError id={errorId}>{reasonError}</FieldError> : null}
      </div>
      {failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>{failure.message}</p>
          {failure.reload && (
            <button type="button" className={buttonClass('secondary')} onClick={reload}>
              Recargar
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClass('primary')} disabled={locked || pending}>
          Guardar cambios
        </button>
        <button
          type="button"
          className={buttonClass('secondary')}
          disabled={pending}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setOpen(false);
        }}
        title={sent?.title ?? ''}
        consequence={sent?.consequence ?? ''}
        confirmLabel="Cambiar competencias"
        pendingLabel="Guardando…"
        onConfirm={confirm}
        isPending={pending}
      />
    </form>
  );
}
