import {
  adminRegistrationFailure,
  voidRegistration,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { buttonClass, Modal, Notice, TextField } from '@/shared/ui';
import { useId, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { styles } from './catalog-copy';
import { reasonMaxLength } from './sale-complimentary-model';
import {
  voidReasonError,
  voidReasonHint,
  voidRegistrationFailure,
  type VoidFailure,
} from './registration-void-model';

type RegistrationVoidProps = {
  eventId: string;
  entitlements: RegistrationEntitlements;
  onVoided: (entitlements: RegistrationEntitlements) => void;
  onReload: () => void;
};

// Voids a mistaken in-person registration that is still pending payment (#104), with a required
// reason. It sits at the end of the sale so it never competes with the payment. A failure that
// needs a reload locks the action, so a lost answer is never sent twice.
export function RegistrationVoid({
  eventId,
  entitlements,
  onVoided,
  onReload,
}: RegistrationVoidProps) {
  const titleId = useId();
  // The reason outlives the dialog, so a retry keeps what was typed.
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const [failure, setFailure] = useState<VoidFailure | null>(null);
  const { registration } = entitlements;
  const locked = failure?.reload ?? false;

  const send = (trimmed: string) => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setFailure(null);
    voidRegistration(eventId, registration.id, trimmed)
      .then(onVoided)
      .catch((caught: unknown) => {
        const next = voidRegistrationFailure(adminRegistrationFailure(caught));
        setFailure(next);
        // A stale screen is explained next to "Recargar"; anything else stays in the dialog.
        if (next.reload) setOpen(false);
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
        Anular inscripción
      </h2>
      <p className="text-sm text-muted">
        Si esta inscripción se hizo por error, anúlala con un motivo. No se puede deshacer.
      </p>
      {failure?.reload && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
        >
          <p>{failure.message}</p>
          <button type="button" className={buttonClass('secondary')} onClick={reload}>
            Recargar
          </button>
        </div>
      )}
      <button
        type="button"
        className={buttonClass('danger')}
        disabled={locked || pending}
        onClick={() => {
          setFailure(null);
          setOpen(true);
        }}
      >
        Anular inscripción
      </button>
      {open && (
        <VoidDialog
          participantName={registration.participant.fullName}
          reason={reason}
          onReasonChange={(value) => {
            setReason(value);
            if (failure?.field) setFailure(null);
          }}
          isPending={pending}
          failure={failure}
          onClose={() => setOpen(false)}
          onConfirm={send}
        />
      )}
    </section>
  );
}

type VoidDialogProps = {
  participantName: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  isPending: boolean;
  failure: VoidFailure | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

// Modeled on Desactivar acceso (#214): the consequences and a required reason for the audit.
function VoidDialog({
  participantName,
  reason,
  onReasonChange,
  isPending,
  failure,
  onClose,
  onConfirm,
}: VoidDialogProps) {
  const [reasonMessage, setReasonMessage] = useState<string | undefined>();
  const fieldId = useId();
  const fieldMessage = reasonMessage ?? (failure?.field ? failure.message : undefined);

  function confirm() {
    if (isPending) return;
    const message = voidReasonError(reason);
    setReasonMessage(message);
    if (message) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal
      role="alertdialog"
      title={`¿Anular la inscripción de ${participantName}?`}
      isOpen
      onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button className={buttonClass('destructive')} isDisabled={isPending} onPress={confirm}>
            {isPending ? 'Anulando…' : 'Anular inscripción'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>La inscripción queda anulada: ya no admite pases, competencias ni pagos.</li>
          <li>Sus pases se conservan como historial.</li>
          <li>No se puede deshacer, pero puedes registrar a la persona de nuevo.</li>
        </ul>
        <TextField
          id={fieldId}
          label="Motivo"
          hint={voidReasonHint(reason)}
          value={reason}
          maxLength={reasonMaxLength}
          required
          error={fieldMessage}
          disabled={isPending}
          onChange={(event) => {
            setReasonMessage(undefined);
            onReasonChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirm();
            }
          }}
        />
        {failure && !failure.field && !failure.reload && (
          <Notice tone="danger">{failure.message}</Notice>
        )}
      </div>
    </Modal>
  );
}
