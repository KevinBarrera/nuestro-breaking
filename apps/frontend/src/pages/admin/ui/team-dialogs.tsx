import type { TeamMember } from '@/entities/admin-team';
import { buttonClass, Modal, Notice, TextField } from '@/shared/ui';
import { useId, useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { AccessFieldset } from './team-access-fieldset';
import {
  accessDraftFrom,
  accessError,
  accessUnchanged,
  currentAccessText,
  reasonError,
  type AccessDraft,
} from './team-form-model';
import { StatusPill } from './team-list';
import { memberInitials, memberStatus } from './team-model';
import type { TeamEventsState } from './use-team-events';

// Who the dialog acts on: initials, name, email and status, as in the Equipo row.
function MemberSummary({ member }: { member: TeamMember }) {
  const status = memberStatus(member, new Date());
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-inner p-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-[13px] font-bold text-heading"
      >
        {memberInitials(member.displayName)}
      </span>
      <span className="flex min-w-0 flex-[1_1_10rem] flex-col text-sm">
        <span className="font-bold break-words text-heading">{member.displayName}</span>
        <span className="truncate text-muted">{member.email}</span>
      </span>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </div>
  );
}

function Consequences({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-fg">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

type ConfirmProps = {
  member: TeamMember;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

type MemberConfirmDialogProps = ConfirmProps & {
  title: string;
  description?: string;
  consequences: ReactNode[];
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'destructive';
};

// An alert dialog that confirms one action on a person, with what will happen as a list.
function MemberConfirmDialog({
  member,
  isPending,
  onClose,
  onConfirm,
  title,
  description,
  consequences,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
}: MemberConfirmDialogProps) {
  return (
    <Modal
      role="alertdialog"
      layout="sectioned"
      title={title}
      description={description}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            {cancelLabel}
          </Button>
          <Button className={buttonClass(tone)} isDisabled={isPending} onPress={onConfirm}>
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <MemberSummary member={member} />
      <Consequences items={consequences} />
    </Modal>
  );
}

// "Generar nuevo enlace" for an active person, "Generar nueva invitación" while invited.
export function NewLinkDialog(props: ConfirmProps) {
  const { member } = props;
  const invited = member.status === 'pending';
  return (
    <MemberConfirmDialog
      {...props}
      title={
        invited
          ? `¿Generar una nueva invitación para ${member.displayName}?`
          : `¿Generar un nuevo enlace para ${member.displayName}?`
      }
      description="Úsalo si perdió el enlace anterior o si olvidó su contraseña."
      consequences={[
        invited
          ? 'La invitación anterior deja de funcionar.'
          : 'El enlace anterior, si había uno, deja de funcionar.',
        invited
          ? 'Su acceso no cambia: entra con lo que tenía asignado.'
          : 'Su contraseña actual sigue sirviendo hasta que use el nuevo enlace.',
        'El nuevo enlace se muestra una sola vez, vence en 72 horas y sirve para un solo uso.',
      ]}
      confirmLabel="Generar enlace"
      pendingLabel="Generando…"
    />
  );
}

export function CancelInvitationDialog(props: ConfirmProps) {
  return (
    <MemberConfirmDialog
      {...props}
      title={`¿Cancelar la invitación de ${props.member.displayName}?`}
      consequences={['El enlace deja de funcionar. Puedes generar uno nuevo cuando quieras.']}
      confirmLabel="Cancelar invitación"
      cancelLabel="Volver"
      pendingLabel="Cancelando…"
      tone="destructive"
    />
  );
}

export function ReactivateDialog(props: ConfirmProps) {
  return (
    <MemberConfirmDialog
      {...props}
      title={`¿Reactivar a ${props.member.displayName}?`}
      consequences={[
        'Recupera el mismo acceso que tenía.',
        'Si nunca activó su cuenta, necesitará un enlace nuevo.',
      ]}
      confirmLabel="Reactivar"
      pendingLabel="Reactivando…"
    />
  );
}

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
      layout="sectioned"
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
      <MemberSummary member={member} />
      <Consequences
        items={[
          'Su sesión se cierra de inmediato en todos sus dispositivos.',
          'Ya no podrá iniciar sesión hasta que alguien la reactive.',
          'Lo que registró, como pagos en efectivo y check-ins, se conserva con su nombre en el historial.',
        ]}
      />
      <div className="mt-5 space-y-4">
        <TextField
          id={fieldId}
          label="Motivo"
          hint="Queda en el historial junto con tu nombre."
          hintPlacement="below"
          placeholder="Ej. Ya no forma parte del staff"
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
  const unchanged = accessUnchanged(access, member.access);

  function change(next: AccessDraft) {
    setAccess(next);
    setAccessMessage(null);
  }

  function confirm() {
    if (unchanged) return;
    const message = accessError(access);
    setAccessMessage(message);
    if (!message) onConfirm(access);
  }

  return (
    <Modal
      layout="sectioned"
      size="lg"
      title={`Cambiar acceso de ${member.displayName}`}
      description={`${currentAccessText(member.access)} Los cambios aplican desde su siguiente acción en el panel.`}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          {unchanged && <span className="text-sm text-muted sm:mr-auto">Sin cambios todavía.</span>}
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            className={buttonClass('primary', unchanged ? 'cursor-not-allowed opacity-50' : '')}
            aria-disabled={unchanged || undefined}
            isDisabled={isPending}
            onPress={confirm}
          >
            {isPending ? 'Guardando…' : 'Guardar acceso'}
          </Button>
        </>
      }
    >
      <MemberSummary member={member} />
      <div className="mt-4 space-y-4">
        <AccessFieldset
          variant="dialog"
          value={access}
          onChange={change}
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
