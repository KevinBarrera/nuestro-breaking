import {
  adminRegistrationFailure,
  swapDiscipline,
  type DisciplineSwapInput,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn } from '@/entities/event-catalog';
import { FieldError, Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CorrectionDialog, OptionCheckbox, ReasonField, ReloadAlert } from './correction-dialog';
import {
  disciplineSwapFailure,
  disciplineSwapRows,
  reviewDisciplineSwap,
  type SwapErrors,
  type SwapFailure,
  type SwapField,
  type SwapOptions,
} from './discipline-swap-model';
import { toggleCompetition } from './sale-competitions-model';

type DisciplineSwapDialogProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // The held full pass the swap replaces.
  held: HeldPass;
  // `disciplineSwapOptions` for that pass; never `unavailable` here.
  options: Exclude<SwapOptions, { status: 'unavailable' }>;
  onSwapped: (entitlements: RegistrationEntitlements, targetName: string) => void;
  onReload: () => void;
  onClose: () => void;
};

// "Cambiar disciplina" (#104, #345): the registration's only full pass becomes another full pass
// of the same current price, with that pass's competitions and a required reason, reviewed before
// the POST. Without such a pass the modal only explains why. A failure that needs a reload only
// offers "Recargar", so a lost answer is never sent twice.
export function DisciplineSwapDialog({
  eventId,
  entitlements,
  held,
  options,
  onSwapped,
  onReload,
  onClose,
}: DisciplineSwapDialogProps) {
  const formId = useId();
  const targetName = `${formId}-target`;
  const targetErrorId = `${formId}-target-error`;
  const reasonId = `${formId}-reason`;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<readonly string[]>([]);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<SwapErrors>({});
  const [failure, setFailure] = useState<SwapFailure | null>(null);
  const [sent, setSent] = useState<DisciplineSwapInput | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const targets = options.status === 'ready' ? options.targets : [];
  const target = targets.find((candidate) => candidate.passTypeId === targetId) ?? null;
  const [focusTarget, setFocusTarget] = useState<{ field: SwapField } | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const id = focusTarget.field === 'reason' ? reasonId : `${formId}-${targets[0]?.passTypeId}`;
    document.getElementById(id)?.focus();
    // The ids only depend on the stable form id and the options the modal opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = reviewDisciplineSwap(target, draft, reason);
    setFailure(null);
    if (!checked.ok) {
      setErrors(checked.errors);
      setFocusTarget({ field: checked.errors.toPassTypeId ? 'toPassTypeId' : 'reason' });
      return;
    }
    setErrors({});
    setSent(checked.input);
  };

  const confirm = () => {
    if (sent === null || target === null || sending.current) return;
    sending.current = true;
    setPending(true);
    const toName = target.name;
    swapDiscipline(eventId, entitlements.registration.id, sent)
      .then((next) => {
        onSwapped(next, toName);
        onClose();
      })
      .catch((caught: unknown) => {
        const next = disciplineSwapFailure(adminRegistrationFailure(caught));
        setFailure(next);
        // A stale screen stays on the review with "Recargar"; anything else goes back to the form.
        if (next.reload) return;
        setErrors(next.fields);
        setSent(null);
        if (next.fields.toPassTypeId || next.fields.reason)
          setFocusTarget({ field: next.fields.toPassTypeId ? 'toPassTypeId' : 'reason' });
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  return (
    <CorrectionDialog
      title="Cambiar disciplina"
      description={`Cambia «${held.name}» por otro pase completo del mismo precio. El monto cobrado no cambia.`}
      formId={formId}
      reviewing={sent !== null && target !== null && options.status === 'ready'}
      rows={
        sent && target && options.status === 'ready'
          ? disciplineSwapRows(options.from, target, draft)
          : []
      }
      reason={reason}
      reviewNote={
        <>
          <p className="text-sm text-muted">
            El monto cobrado no cambia: los dos pases cuestan lo mismo.
          </p>
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
      confirmLabel="Cambiar disciplina"
      pending={pending}
      locked={!!failure?.reload}
      canReview={options.status === 'ready'}
      onBack={() => setSent(null)}
      onConfirm={confirm}
      onClose={onClose}
    >
      {options.status === 'none' ? (
        <p className="text-sm text-fg">{options.message}</p>
      ) : (
        <form
          id={formId}
          noValidate
          onSubmit={review}
          className="space-y-4"
          aria-label="Cambiar disciplina"
        >
          <fieldset aria-describedby={errors.toPassTypeId ? targetErrorId : undefined}>
            <legend className="text-sm font-semibold text-heading">Pase nuevo</legend>
            <div className="mt-1.5 flex flex-col gap-0.5 rounded-lg border border-line p-1">
              {targets.map((candidate) => (
                <label
                  key={candidate.passTypeId}
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 hover:bg-row"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <input
                      id={`${formId}-${candidate.passTypeId}`}
                      // The modal opens to choose the new pass, so the first one takes the focus.
                      autoFocus={candidate === targets[0]}
                      type="radio"
                      name={targetName}
                      value={candidate.passTypeId}
                      checked={targetId === candidate.passTypeId}
                      aria-invalid={errors.toPassTypeId ? true : undefined}
                      className="size-5 shrink-0 accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onChange={() => {
                        setTargetId(candidate.passTypeId);
                        setDraft([]);
                        setErrors((current) => ({ ...current, toPassTypeId: undefined }));
                      }}
                    />
                    <span className="min-w-0 text-sm break-words text-fg">{candidate.name}</span>
                  </span>
                  <span className="font-mono text-sm text-fg">
                    {formatMxn(candidate.priceCents)}
                  </span>
                </label>
              ))}
            </div>
            {errors.toPassTypeId ? (
              <FieldError id={targetErrorId}>{errors.toPassTypeId}</FieldError>
            ) : null}
          </fieldset>
          {target && (
            <fieldset>
              <legend className="text-sm font-semibold text-heading">
                Competencias de «{target.name}»
              </legend>
              {target.choices.length === 0 ? (
                <p className="py-2 text-sm text-muted">Este pase no tiene competencias a elegir.</p>
              ) : (
                <div className="mt-1.5 flex flex-col gap-0.5 rounded-lg border border-line p-1">
                  {target.choices.map((choice) => (
                    <OptionCheckbox
                      key={choice.activityId}
                      label={choice.name}
                      checked={draft.includes(choice.activityId)}
                      onChange={() =>
                        setDraft((current) => toggleCompetition(current, choice.activityId))
                      }
                    />
                  ))}
                </div>
              )}
            </fieldset>
          )}
          <ReasonField
            id={reasonId}
            value={reason}
            placeholder="Ej. Se inscribió por error en otra disciplina"
            error={errors.reason}
            onChange={(value) => {
              setReason(value);
              setErrors((current) => ({ ...current, reason: undefined }));
            }}
          />
          {failure && !failure.reload && <Notice tone="danger">{failure.message}</Notice>}
        </form>
      )}
    </CorrectionDialog>
  );
}
