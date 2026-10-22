import {
  adminRegistrationFailure,
  correctCash,
  type CashCorrectionInput,
  type CashPayment,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn, parseMxnToCents } from '@/entities/event-catalog';
import { buttonClass, CheckboxField, ConfirmDialog, Notice, TextField } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import {
  cashCorrectionConfirmation,
  cashCorrectionFailure,
  cashReasonHint,
  initialCashCorrectionForm,
  passTotalWarning,
  reviewCashCorrection,
  type CashCorrectionErrors,
  type CashCorrectionFailure,
  type CashCorrectionField,
  type CashCorrectionForm,
} from './cash-correction-model';
import { receiptMaxLength } from './sale-cash-model';
import { reasonMaxLength } from './sale-complimentary-model';

type CashCorrectionProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // The registration's current cash payment.
  cash: CashPayment;
  onCorrected: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

type Sent = { input: CashCorrectionInput; title: string; consequence: string };

const fieldOrder: readonly CashCorrectionField[] = [
  'amount',
  'receipt',
  'reason',
  'receiptChecked',
];

// The cash payment of a confirmed registration (#104): its current amount and receipt number, and
// their correction after checking the original paper receipt, with a required reason. The form
// starts collapsed and only the confirmation dialog sends the POST. An amount other than the pass
// total is warned about but allowed. A failure that needs a reload locks the action, so a lost
// answer is never sent twice.
export function CashCorrection({
  eventId,
  entitlements,
  cash,
  onCorrected,
  onReload,
}: CashCorrectionProps) {
  const titleId = useId();
  const formId = useId();
  const { registration, passes } = entitlements;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CashCorrectionForm>(() => initialCashCorrectionForm(cash));
  const [errors, setErrors] = useState<CashCorrectionErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<CashCorrectionFailure | null>(null);
  // `sent` outlives `confirming` so the dialog keeps its copy while it closes.
  const [sent, setSent] = useState<Sent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The field a rejected POST marked; it takes focus once the dialog that sent it has closed.
  const [focusRequest, setFocusRequest] = useState<{ field: CashCorrectionField } | null>(null);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  // Set when the form closes, so focus goes back to the button that opened it, or to "Recargar"
  // when a stale screen has disabled that button.
  const restoreFocus = useRef(false);
  const locked = failure?.reload ?? false;
  const fieldId = (field: CashCorrectionField) => `${formId}-${field}`;
  const focusField = (field: CashCorrectionField) =>
    document.getElementById(fieldId(field))?.focus();
  const warning = passTotalWarning(parseMxnToCents(form.amount), passes);

  useEffect(() => {
    if (open) focusField('amount');
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      (locked ? reloadRef : toggleRef).current?.focus();
    }
    // `focusField` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // After the dialog has closed and returned focus to its trigger, the marked field takes it.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => focusField(focusRequest.field));
    return () => cancelAnimationFrame(frame);
    // `focusField` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const openForm = () => {
    setForm(initialCashCorrectionForm(cash));
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

  const edit = <K extends CashCorrectionField>(field: K, value: CashCorrectionForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
    if (failure && !failure.reload) setFailure(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || pending) return;
    const checked = reviewCashCorrection(form, cash);
    setFailure(null);
    if (!checked.ok) {
      setErrors(checked.errors);
      setNotice(checked.unchanged ?? null);
      focusField(fieldOrder.find((field) => checked.errors[field]) ?? 'amount');
      return;
    }
    setErrors({});
    setNotice(null);
    setSent({
      input: checked.input,
      ...cashCorrectionConfirmation(
        cash,
        checked.input,
        registration.participant.fullName,
        passTotalWarning(checked.input.amountCents, passes),
      ),
    });
    setConfirming(true);
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    correctCash(eventId, registration.id, sent.input)
      .then((next) => {
        setConfirming(false);
        onCorrected(next);
        setSaved(true);
        close();
      })
      .catch((caught: unknown) => {
        const next = cashCorrectionFailure(adminRegistrationFailure(caught));
        setFailure(next);
        setErrors(next.fields);
        setConfirming(false);
        // A stale screen is explained next to "Recargar"; anything else stays in the form.
        if (next.reload) close();
        else {
          const first = fieldOrder.find((field) => next.fields[field]);
          if (first) setFocusRequest({ field: first });
        }
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  const reload = () => {
    setFailure(null);
    onReload();
  };

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Pago en efectivo
      </h2>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
        <dt className="text-sm font-semibold text-fg">Monto cobrado</dt>
        <dd className="font-mono text-lg font-bold text-heading">{formatMxn(cash.amountCents)}</dd>
        <dt className="text-sm font-semibold text-fg">Recibo</dt>
        <dd className="min-w-0 font-mono break-all text-fg">
          {cash.receipt ?? (
            <span className="font-sans text-sm text-muted">
              Sin número de recibo: se registró antes de pedirlo.
            </span>
          )}
        </dd>
      </dl>
      {saved && (
        <p role="status" className="text-sm font-semibold text-success-fg">
          Se guardó la corrección del pago.
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
          Corregir pago en efectivo
        </button>
      ) : (
        <form
          noValidate
          onSubmit={review}
          className="space-y-4"
          aria-label="Corregir pago en efectivo"
        >
          <p className="text-sm text-muted">
            Corrige el monto o el número de recibo después de revisar el recibo en papel. El pago
            original queda en el historial.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={fieldId('amount')}
              label="Monto (MXN)"
              hint="En pesos, por ejemplo 1500 o 1500,50."
              value={form.amount}
              inputMode="decimal"
              autoComplete="off"
              required
              error={errors.amount}
              disabled={pending}
              onChange={(event) => edit('amount', event.currentTarget.value)}
            />
            <TextField
              id={fieldId('receipt')}
              label="Número de recibo"
              hint="El número impreso en el recibo en papel."
              value={form.receipt}
              maxLength={receiptMaxLength}
              autoComplete="off"
              required
              error={errors.receipt}
              disabled={pending}
              onChange={(event) => edit('receipt', event.currentTarget.value)}
            />
          </div>
          {warning && <Notice>{warning}</Notice>}
          <TextField
            id={fieldId('reason')}
            label="Motivo"
            hint={cashReasonHint(form.reason)}
            value={form.reason}
            maxLength={reasonMaxLength}
            required
            error={errors.reason}
            disabled={pending}
            onChange={(event) => edit('reason', event.currentTarget.value)}
          />
          <CheckboxField
            id={fieldId('receiptChecked')}
            label="Revisé el recibo original"
            checked={form.receiptChecked}
            required
            error={errors.receiptChecked}
            disabled={pending}
            onChange={(event) => edit('receiptChecked', event.currentTarget.checked)}
          />
          {notice && <Notice>{notice}</Notice>}
          {failure && !failure.reload && <Notice tone="danger">{failure.message}</Notice>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass('primary')} disabled={pending}>
              Revisar corrección
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
            confirmLabel="Corregir pago"
            pendingLabel="Guardando…"
            onConfirm={confirm}
            isPending={pending}
          />
        </form>
      )}
    </section>
  );
}
