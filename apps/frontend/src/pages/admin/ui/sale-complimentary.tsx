import {
  adminRegistrationFailure,
  confirmComplimentary,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn } from '@/entities/event-catalog';
import { buttonClass, ConfirmDialog, FieldError } from '@/shared/ui';
import { useId, useRef, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import { confirmedEntitlements } from './sale-cash-model';
import {
  complimentaryConfirmation,
  complimentaryReasonError,
  complimentaryReasonHint,
  confirmComplimentaryFailure,
  reasonMaxLength,
  type ComplimentaryFailure,
} from './sale-complimentary-model';

type SaleComplimentaryProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  onConfirmed: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

// The input keeps the 44px target; it mirrors the TextField frame.
const reasonFrame =
  'mt-1 block min-h-24 w-full rounded-lg border bg-input px-3 py-2 text-base text-fg placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus disabled:opacity-60';

// Confirms without payment a pending registration whose passes total $0 (#263). The operator
// writes the required reason and confirms in a dialog. It keeps the cash safeguards: a failure
// that needs a reload locks the button, so a lost answer is never sent twice.
export function SaleComplimentary({
  eventId,
  entitlements,
  onConfirmed,
  onReload,
}: SaleComplimentaryProps) {
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  // `sent` outlives `open` so the dialog keeps its copy while it closes.
  const [sent, setSent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const [failure, setFailure] = useState<ComplimentaryFailure | null>(null);
  const { registration } = entitlements;
  const locked = failure?.reload ?? false;

  const edit = (value: string) => {
    setReason(value);
    setError(undefined);
    if (failure && !failure.reload) setFailure(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || pending) return;
    const found = complimentaryReasonError(reason);
    setError(found);
    if (found) return;
    setFailure(null);
    setSent(reason.trim());
    setOpen(true);
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    confirmComplimentary(eventId, registration.id, { reason: sent })
      .then((confirmation) => onConfirmed(confirmedEntitlements(entitlements, confirmation)))
      .catch((caught: unknown) => {
        const next = confirmComplimentaryFailure(adminRegistrationFailure(caught));
        if (next.field) setError(next.message);
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

  const confirmation =
    sent === null
      ? { title: '', consequence: '' }
      : complimentaryConfirmation({
          reason: sent,
          participantName: registration.participant.fullName,
        });
  const hintId = `${reasonId}-hint`;
  const errorId = `${reasonId}-error`;

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-4`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Confirmación sin cobro
      </h2>
      <dl className="flex flex-wrap items-baseline justify-between gap-x-3">
        <dt className="font-semibold text-fg">Total a cobrar</dt>
        <dd className="font-mono text-2xl font-bold text-heading">{formatMxn(0)}</dd>
      </dl>
      <p className="text-sm text-muted">
        Los pases de esta inscripción no tienen costo. Escribe el motivo y confírmala sin cobro.
      </p>
      <form noValidate className="space-y-4" onSubmit={review}>
        <div>
          <label htmlFor={reasonId} className="block text-sm font-semibold text-fg">
            Motivo
          </label>
          <p id={hintId} className="mt-0.5 text-sm text-muted">
            {complimentaryReasonHint(reason)}
          </p>
          <textarea
            id={reasonId}
            value={reason}
            rows={3}
            maxLength={reasonMaxLength}
            placeholder="Ej. Golden ticket, ganador de …"
            required
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className={`${reasonFrame} ${error ? 'border-danger-fg' : 'border-input-line'}`}
            onChange={(event) => edit(event.target.value)}
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
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
        <button type="submit" className={buttonClass('primary')} disabled={locked || pending}>
          Confirmar sin cobro
        </button>
      </form>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setOpen(false);
        }}
        title={confirmation.title}
        consequence={confirmation.consequence}
        confirmLabel="Confirmar sin cobro"
        pendingLabel="Confirmando…"
        onConfirm={confirm}
        isPending={pending}
      />
    </section>
  );
}
