import {
  adminRegistrationFailure,
  confirmCashPayment,
  type CashPaymentInput,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn } from '@/entities/event-catalog';
import { buttonClass, ConfirmDialog, TextField } from '@/shared/ui';
import { useId, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import {
  cashConfirmation,
  cashFormErrors,
  cashPaymentInput,
  cashTotalCents,
  cashUnavailableReason,
  confirmCashFailure,
  confirmedEntitlements,
  noteMaxLength,
  receiptMaxLength,
  type CashErrors,
  type CashFailure,
  type CashForm,
} from './sale-cash-model';

type SaleCashProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  onConfirmed: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

// Records the cash received for a pending registration (#105). The total comes from the held
// passes and is read-only; the operator types the paper receipt number and confirms in a dialog.
// A failure that needs a reload locks the button, so a lost answer is never sent twice.
export function SaleCash({ eventId, entitlements, onConfirmed, onReload }: SaleCashProps) {
  const titleId = useId();
  const reasonId = useId();
  const [form, setForm] = useState<CashForm>({ receipt: '', note: '' });
  const [errors, setErrors] = useState<CashErrors>({});
  // `input` outlives `open` so the dialog keeps its copy while it closes.
  const [input, setInput] = useState<CashPaymentInput | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CashFailure | null>(null);
  const { registration, passes } = entitlements;
  const totalCents = cashTotalCents(passes);
  const unavailable = cashUnavailableReason(passes);
  const locked = failure?.reload ?? false;

  const edit = (field: keyof CashForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (failure && !failure.reload) setFailure(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unavailable || locked || pending) return;
    const found = cashFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailure(null);
    setInput(cashPaymentInput(passes, form));
    setOpen(true);
  };

  const confirm = () => {
    if (!input || pending) return;
    setPending(true);
    confirmCashPayment(eventId, registration.id, input)
      .then((confirmation) => onConfirmed(confirmedEntitlements(entitlements, confirmation)))
      .catch((error: unknown) => {
        const next = confirmCashFailure(adminRegistrationFailure(error));
        if (next.field) setErrors({ [next.field]: next.message });
        else setFailure(next);
      })
      .finally(() => {
        setPending(false);
        setOpen(false);
      });
  };

  const reload = () => {
    setFailure(null);
    onReload();
  };

  const confirmation = input
    ? cashConfirmation({
        totalCents: input.amountCents,
        receipt: input.receipt,
        participantName: registration.participant.fullName,
      })
    : { title: '', consequence: '' };

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-4`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Pago en efectivo
      </h2>
      <dl className="flex flex-wrap items-baseline justify-between gap-x-3">
        <dt className="font-semibold text-fg">Total a cobrar</dt>
        <dd className="font-mono text-2xl font-bold text-heading">{formatMxn(totalCents)}</dd>
      </dl>
      <p className="text-sm text-muted">Suma de los pases agregados, sin cargo por servicio.</p>
      {unavailable && (
        <p id={reasonId} className="rounded-lg bg-surface-inner p-4 text-sm text-fg">
          {unavailable}
        </p>
      )}
      <form noValidate className="space-y-4" onSubmit={review}>
        <TextField
          label="Número de recibo"
          hint="El número impreso en el recibo en papel."
          value={form.receipt}
          maxLength={receiptMaxLength}
          autoComplete="off"
          required
          disabled={unavailable !== null || pending}
          error={errors.receipt}
          onChange={(event) => edit('receipt', event.target.value)}
        />
        <TextField
          label="Nota"
          optional
          value={form.note}
          maxLength={noteMaxLength}
          autoComplete="off"
          disabled={unavailable !== null || pending}
          error={errors.note}
          onChange={(event) => edit('note', event.target.value)}
        />
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
        <button
          type="submit"
          className={buttonClass('primary')}
          disabled={unavailable !== null || locked || pending}
          aria-describedby={unavailable ? reasonId : undefined}
        >
          Confirmar pago
        </button>
      </form>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pending) setOpen(false);
        }}
        title={confirmation.title}
        consequence={confirmation.consequence}
        confirmLabel="Confirmar pago"
        pendingLabel="Registrando…"
        onConfirm={confirm}
        isPending={pending}
      />
    </section>
  );
}
