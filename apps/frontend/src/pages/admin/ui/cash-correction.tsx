import {
  adminRegistrationFailure,
  correctCash,
  type CashCorrectionInput,
  type CashPayment,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { parseMxnToCents } from '@/entities/event-catalog';
import { CheckboxField, Notice, TextField } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  cashAmountHint,
  cashCorrectionFailure,
  cashCorrectionRows,
  initialCashCorrectionForm,
  reviewCashCorrection,
  type CashCorrectionErrors,
  type CashCorrectionFailure,
  type CashCorrectionField,
  type CashCorrectionForm,
} from './cash-correction-model';
import { CorrectionDialog, ReasonField, ReloadAlert } from './correction-dialog';
import { receiptMaxLength } from './sale-cash-model';

type CashCorrectionDialogProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  // The registration's current cash payment.
  cash: CashPayment;
  onCorrected: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
  onClose: () => void;
};

const fieldOrder: readonly CashCorrectionField[] = [
  'amount',
  'receipt',
  'receiptChecked',
  'reason',
];

const hintTones = { success: 'text-success-fg', warning: 'text-warning-fg' };

// "Corregir pago" on a confirmed cash registration (#104, #345): the amount and receipt number,
// corrected after checking the paper receipt and with a required reason, reviewed before the POST.
// An amount other than the pass total is explained but allowed. A failure that needs a reload
// only offers "Recargar", so a lost answer is never sent twice.
export function CashCorrectionDialog({
  eventId,
  entitlements,
  cash,
  onCorrected,
  onReload,
  onClose,
}: CashCorrectionDialogProps) {
  const formId = useId();
  const { registration, passes } = entitlements;
  const [form, setForm] = useState<CashCorrectionForm>(() => initialCashCorrectionForm(cash));
  const [errors, setErrors] = useState<CashCorrectionErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<CashCorrectionFailure | null>(null);
  const [sent, setSent] = useState<CashCorrectionInput | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const fieldId = (field: CashCorrectionField) => `${formId}-${field}`;
  // A field to focus once the form has rendered, e.g. after going back from the review.
  const [focusTarget, setFocusTarget] = useState<{ field: CashCorrectionField } | null>(null);
  const focusField = (field: CashCorrectionField) => setFocusTarget({ field });
  useEffect(() => {
    if (focusTarget) document.getElementById(fieldId(focusTarget.field))?.focus();
    // `fieldId` only reads the stable form id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);
  const hint = cashAmountHint(parseMxnToCents(form.amount), passes);

  const edit = <K extends CashCorrectionField>(field: K, value: CashCorrectionForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setSent(checked.input);
  };

  const confirm = () => {
    if (sent === null || sending.current) return;
    sending.current = true;
    setPending(true);
    correctCash(eventId, registration.id, sent)
      .then((next) => {
        onCorrected(next);
        onClose();
      })
      .catch((caught: unknown) => {
        const next = cashCorrectionFailure(adminRegistrationFailure(caught));
        setFailure(next);
        // A stale screen stays on the review with "Recargar"; anything else goes back to the form.
        if (next.reload) return;
        setErrors(next.fields);
        setSent(null);
        const first = fieldOrder.find((field) => next.fields[field]);
        if (first) focusField(first);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  return (
    <CorrectionDialog
      title="Corregir pago en efectivo"
      description="Corrige el monto o el número de recibo después de revisar el recibo en papel. El pago original queda en el historial."
      formId={formId}
      reviewing={sent !== null}
      rows={sent ? cashCorrectionRows(cash, sent) : []}
      reason={form.reason}
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
      confirmLabel="Corregir pago"
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
        aria-label="Corregir pago en efectivo"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={fieldId('amount')}
            // The modal opens to correct this value, so it takes the focus.
            autoFocus
            label="Monto (MXN)"
            prefix="$"
            value={form.amount}
            inputMode="decimal"
            autoComplete="off"
            required
            error={errors.amount}
            inputClassName="font-mono"
            onChange={(event) => edit('amount', event.currentTarget.value)}
          />
          <TextField
            id={fieldId('receipt')}
            label="Número de recibo"
            value={form.receipt}
            maxLength={receiptMaxLength}
            autoComplete="off"
            required
            error={errors.receipt}
            inputClassName="font-mono"
            onChange={(event) => edit('receipt', event.currentTarget.value)}
          />
        </div>
        {hint && !errors.amount && (
          <p className={`text-sm font-semibold ${hintTones[hint.tone]}`}>{hint.text}</p>
        )}
        <CheckboxField
          id={fieldId('receiptChecked')}
          label="Revisé el recibo en papel"
          checked={form.receiptChecked}
          required
          error={errors.receiptChecked}
          onChange={(event) => edit('receiptChecked', event.currentTarget.checked)}
        />
        <ReasonField
          id={fieldId('reason')}
          value={form.reason}
          placeholder="Ej. Se capturó mal el monto del recibo"
          error={errors.reason}
          onChange={(value) => edit('reason', value)}
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
