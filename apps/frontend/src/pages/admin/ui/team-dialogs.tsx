import type { TeamMember } from '@/entities/admin-team';
import { buttonClass, Modal, Notice, TextField } from '@/shared/ui';
import { useId, useState } from 'react';
import { Button } from 'react-aria-components';
import { AccessFieldset } from './team-access-fieldset';
import { accessDraftFrom, reasonError, type AccessDraft } from './team-form-model';
import type { TeamEventsState } from './use-team-events';

type DeactivateDialogProps = {
  member: TeamMember;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

// Desactivar acceso (#214): the consequences and a required reason that goes to the audit.
export function DeactivateDialog({
  member,
  isPending,
  error,
  onClose,
  onConfirm,
}: DeactivateDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonMessage, setReasonMessage] = useState<string | null>(null);
  const fieldId = useId();

  function confirm() {
    const message = reasonError(reason);
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
      title={`¿Desactivar a ${member.displayName}?`}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button className={buttonClass('destructive')} isDisabled={isPending} onPress={confirm}>
            {isPending ? 'Desactivando…' : 'Desactivar acceso'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>Su sesión se cierra de inmediato en todos sus dispositivos.</li>
          <li>Ya no podrá iniciar sesión hasta que alguien la reactive.</li>
          <li>
            Lo que registró, como pagos en efectivo y check-ins, se conserva con su nombre en el
            historial.
          </li>
        </ul>
        <TextField
          id={fieldId}
          label="Motivo"
          hint="Queda en el historial."
          value={reason}
          maxLength={500}
          error={reasonMessage}
          disabled={isPending}
          onChange={(event) => setReason(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirm();
            }
          }}
        />
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}

type ChangeAccessDialogProps = {
  member: TeamMember;
  events: TeamEventsState;
  onRetryEvents: () => void;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (access: AccessDraft) => void;
};

export function ChangeAccessDialog({
  member,
  events,
  onRetryEvents,
  isPending,
  error,
  onClose,
  onConfirm,
}: ChangeAccessDialogProps) {
  const [access, setAccess] = useState(() => accessDraftFrom(member.access));
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  function confirm() {
    if (access.scope === 'events' && access.eventIds.length === 0) {
      setAccessMessage('Elige al menos un evento.');
      return;
    }
    setAccessMessage(null);
    onConfirm(access);
  }

  return (
    <Modal
      title={`Cambiar acceso de ${member.displayName}`}
      description="Los cambios aplican desde su siguiente acción en el panel."
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button className={buttonClass('primary')} isDisabled={isPending} onPress={confirm}>
            {isPending ? 'Guardando…' : 'Guardar acceso'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <AccessFieldset
          value={access}
          onChange={setAccess}
          events={events}
          onRetryEvents={onRetryEvents}
          error={accessMessage}
          disabled={isPending}
        />
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}
