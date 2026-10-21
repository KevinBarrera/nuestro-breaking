import {
  adminRegistrationFailure,
  swapDiscipline,
  type DisciplineSwapInput,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';
import { buttonClass, CheckboxField, ConfirmDialog, FieldError, TextField } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import {
  disciplineSwapConfirmation,
  disciplineSwapFailure,
  disciplineSwapOptions,
  reviewDisciplineSwap,
  swapReasonHint,
  type SwapErrors,
  type SwapFailure,
} from './discipline-swap-model';
import { toggleCompetition } from './sale-competitions-model';
import { reasonMaxLength } from './sale-complimentary-model';

type DisciplineSwapProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // The held full pass the swap replaces.
  held: HeldPass;
  // Null when the event's pass types or activities could not be read.
  passTypes: CatalogPassType[] | null;
  activities: CatalogActivity[] | null;
  onSwapped: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

type Sent = { input: DisciplineSwapInput; title: string; consequence: string };

// Moves the registration's only full pass to another full pass of the same current price (#104):
// the operator picks the pass, its competitions and the required reason, then confirms the change
// in a dialog, which alone sends the POST. It starts collapsed so it never competes with the sale.
// A failure that needs a reload locks the action, so a lost answer is never sent twice. Without a
// readable catalog there is nothing to choose, so the card stays hidden, as "Editar competencias".
export function DisciplineSwap({
  eventId,
  entitlements,
  held,
  passTypes,
  activities,
  onSwapped,
  onReload,
}: DisciplineSwapProps) {
  const titleId = useId();
  const formId = useId();
  const options = disciplineSwapOptions(held, passTypes, activities);
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<readonly string[]>([]);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<SwapErrors>({});
  const [failure, setFailure] = useState<SwapFailure | null>(null);
  // `sent` outlives `confirming` so the dialog keeps its copy while it closes.
  const [sent, setSent] = useState<Sent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  // Set when the form closes, so focus goes back to the button that opened it, or to "Recargar"
  // when a stale screen has disabled that button.
  const restoreFocus = useRef(false);
  const locked = failure?.reload ?? false;
  const targets = options.status === 'ready' ? options.targets : [];
  const target = targets.find((candidate) => candidate.passTypeId === targetId) ?? null;
  const targetName = `${formId}-target`;
  const targetErrorId = `${formId}-target-error`;
  const reasonId = `${formId}-reason`;

  useEffect(() => {
    if (open) document.querySelector<HTMLInputElement>(`input[name="${targetName}"]`)?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      (locked ? reloadRef : toggleRef).current?.focus();
    }
    // `targetName` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openForm = () => {
    setTargetId(null);
    setDraft([]);
    setReason('');
    setErrors({});
    setFailure(null);
    setSaved(null);
    setOpen(true);
  };

  const close = () => {
    restoreFocus.current = true;
    setOpen(false);
  };

  const clearFailure = () => {
    if (failure && !failure.reload) setFailure(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || pending || options.status !== 'ready') return;
    const checked = reviewDisciplineSwap(target, draft, reason);
    if (!checked.ok) {
      setErrors(checked.errors);
      if (checked.errors.toPassTypeId)
        document.querySelector<HTMLInputElement>(`input[name="${targetName}"]`)?.focus();
      else document.getElementById(reasonId)?.focus();
      return;
    }
    if (!target) return;
    setFailure(null);
    setSent({
      input: checked.input,
      ...disciplineSwapConfirmation(options.from, target, draft, checked.input.reason),
    });
    setConfirming(true);
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    const fromName = held.name;
    const toName = target?.name ?? '';
    swapDiscipline(eventId, entitlements.registration.id, sent.input)
      .then((next) => {
        setConfirming(false);
        onSwapped(next);
        setSaved(`Se cambió «${fromName}» por «${toName}».`);
        close();
      })
      .catch((caught: unknown) => {
        const next = disciplineSwapFailure(adminRegistrationFailure(caught));
        setFailure(next);
        setErrors(next.fields);
        // A stale screen is explained next to "Recargar"; anything else stays in the form.
        if (next.reload) close();
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
        setConfirming(false);
      });
  };

  const reload = () => {
    setFailure(null);
    onReload();
  };

  if (options.status === 'unavailable') return null;

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Cambiar disciplina
      </h2>
      <p className="text-sm text-muted">
        Cambia «{held.name}» por otro pase completo del mismo precio, con un motivo. El monto
        cobrado no cambia.
      </p>
      {saved && (
        <p role="status" className="text-sm font-semibold text-success-fg">
          {saved}
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
      {options.status === 'none' ? (
        <p className="text-sm text-fg">{options.message}</p>
      ) : !open ? (
        <button
          ref={toggleRef}
          type="button"
          className={buttonClass('secondary')}
          disabled={locked}
          onClick={openForm}
        >
          Cambiar disciplina
        </button>
      ) : (
        <form noValidate onSubmit={review} className="space-y-4" aria-label="Cambiar disciplina">
          <fieldset aria-describedby={errors.toPassTypeId ? targetErrorId : undefined}>
            <legend className="text-sm font-semibold text-fg">Pase nuevo</legend>
            {targets.map((candidate) => (
              <label
                key={candidate.passTypeId}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <input
                    type="radio"
                    name={targetName}
                    value={candidate.passTypeId}
                    checked={targetId === candidate.passTypeId}
                    disabled={pending}
                    aria-invalid={errors.toPassTypeId ? true : undefined}
                    className="size-5 shrink-0 accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
                    onChange={() => {
                      setTargetId(candidate.passTypeId);
                      setDraft([]);
                      setErrors((current) => ({ ...current, toPassTypeId: undefined }));
                      clearFailure();
                    }}
                  />
                  <span className="min-w-0 text-sm break-words text-fg">{candidate.name}</span>
                </span>
                <span className="font-mono text-sm text-fg">{formatMxn(candidate.priceCents)}</span>
              </label>
            ))}
            {errors.toPassTypeId ? (
              <FieldError id={targetErrorId}>{errors.toPassTypeId}</FieldError>
            ) : null}
          </fieldset>
          {target && (
            <fieldset>
              <legend className="text-sm font-semibold text-fg">
                Competencias de «{target.name}»
              </legend>
              {target.choices.length === 0 ? (
                <p className="py-2 text-sm text-muted">Este pase no tiene competencias a elegir.</p>
              ) : (
                target.choices.map((choice) => (
                  <CheckboxField
                    key={choice.activityId}
                    label={choice.name}
                    checked={draft.includes(choice.activityId)}
                    disabled={pending}
                    onChange={() => {
                      setDraft((current) => toggleCompetition(current, choice.activityId));
                      clearFailure();
                    }}
                  />
                ))
              )}
            </fieldset>
          )}
          <TextField
            id={reasonId}
            label="Motivo"
            hint={swapReasonHint(reason)}
            value={reason}
            maxLength={reasonMaxLength}
            required
            error={errors.reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setErrors((current) => ({ ...current, reason: undefined }));
              clearFailure();
            }}
          />
          {failure && !failure.reload && (
            <p
              role="alert"
              className="rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
            >
              {failure.message}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass('primary')} disabled={pending}>
              Revisar cambio
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
          <ConfirmDialog
            isOpen={confirming}
            onOpenChange={(isOpen) => {
              if (!isOpen && !pending) setConfirming(false);
            }}
            title={sent?.title ?? ''}
            consequence={sent?.consequence ?? ''}
            confirmLabel="Cambiar disciplina"
            pendingLabel="Guardando…"
            onConfirm={confirm}
            isPending={pending}
          />
        </form>
      )}
    </section>
  );
}
