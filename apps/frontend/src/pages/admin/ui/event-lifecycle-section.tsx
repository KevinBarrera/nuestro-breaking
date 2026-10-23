import {
  adminEventFailure,
  archiveEvent,
  deleteEvent,
  restoreEvent,
  type AdminEvent,
  type EventDeleteBlocker,
} from '@/entities/admin-event';
import { routes } from '@/shared/config';
import { buttonClass, Modal, Notice, TextField } from '@/shared/ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { useNavigate } from 'react-router';
import { styles } from './catalog-copy';
import { SettingsSection } from './settings-section';
import {
  archiveConsequences,
  archivedListNotice,
  archiveHint,
  deleteAvailability,
  deleteAvailableHint,
  deletedNotice,
  deleteFailureMessage,
  deleteUnknownHint,
  deleteUnknownNotice,
  restoreHint,
  slugConfirmed,
} from './event-lifecycle-model';
import { eventFailureMessage } from './event-model';

type EventLifecycleSectionProps = {
  event: AdminEvent;
  archived: boolean;
  // What keeps the event from being deleted; null when not known (the API decides).
  deleteBlockers: EventDeleteBlocker[] | null;
  onRestored: (event: AdminEvent) => void;
  // A delete was refused with `event_not_empty`.
  onNotEmpty: (blockers: EventDeleteBlocker[]) => void;
  // The event changed state elsewhere (archived or restored meanwhile), or an answer was lost:
  // read it again. The page keeps `message` across the reload, which remounts this section.
  onStale: (message?: string) => void;
};

type Dialog = 'archive' | 'delete' | null;

// "Archivar o eliminar" on Datos del evento (#213 T10), for global admins only. Archiving or
// deleting leaves the event, so both go to the event list with a notice; restoring stays here.
export function EventLifecycleSection({
  event,
  archived,
  deleteBlockers,
  onRestored,
  onNotEmpty,
  onStale,
}: EventLifecycleSectionProps) {
  const navigate = useNavigate();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A delete was refused with `event_not_empty`, whatever blockers it named.
  const [refused, setRefused] = useState(false);
  const availability = deleteAvailability(deleteBlockers, refused);
  const deletable = availability.kind !== 'blocked';

  const toList = (notice: string) => void navigate(routes.admin, { state: { notice } });

  function open(next: Dialog) {
    setMessage(null);
    setDialogError(null);
    setDialog(next);
  }

  function close() {
    if (!pending) setDialog(null);
  }

  async function archive() {
    setPending(true);
    setDialogError(null);
    try {
      await archiveEvent(event.id);
      toList(archivedListNotice(event.name));
    } catch (error) {
      const failure = adminEventFailure(error);
      setPending(false);
      if (failure.kind === 'rule' && failure.code === 'event_archived') {
        setDialog(null);
        onStale();
        return;
      }
      if (failure.kind === 'unknown') {
        // It may have been archived: read the event again to show its real state.
        setDialog(null);
        onStale('No pudimos confirmar si el evento se archivó. Revisamos su estado de nuevo.');
        return;
      }
      setDialogError(eventFailureMessage(failure));
    }
  }

  async function restore() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      onRestored(await restoreEvent(event.id));
      heading.current?.focus();
    } catch (error) {
      const failure = adminEventFailure(error);
      if (failure.kind === 'rule' && failure.code === 'event_not_archived') onStale();
      else setMessage(eventFailureMessage(failure));
    } finally {
      setPending(false);
    }
  }

  async function remove(confirmSlug: string) {
    setPending(true);
    setDialogError(null);
    try {
      await deleteEvent(event.id, confirmSlug);
      toList(deletedNotice(event.name));
    } catch (error) {
      const failure = adminEventFailure(error);
      setPending(false);
      if (failure.kind === 'unknown') return toList(deleteUnknownNotice(event.name));
      if (failure.kind === 'not_empty') {
        // The button turns into the design's disabled state, with the reason next to it.
        setDialog(null);
        setRefused(true);
        onNotEmpty(failure.blockers);
        heading.current?.focus();
        return;
      }
      setDialogError(deleteFailureMessage(failure));
    }
  }

  const deleteHint =
    availability.kind === 'blocked'
      ? availability.reason
      : availability.kind === 'unknown'
        ? deleteUnknownHint
        : deleteAvailableHint;

  return (
    <SettingsSection
      headingId={headingId}
      headingRef={heading}
      title="Archivar o eliminar"
      description="Acciones que sacan el evento de la operación."
    >
      <div className="overflow-hidden rounded-xl border border-danger-fg bg-surface">
        {message && (
          <div className="border-b border-line p-4">
            <Notice tone="danger">{message}</Notice>
          </div>
        )}
        {archived ? (
          <LifecycleRow title="Restaurar evento" hint={restoreHint}>
            <button
              type="button"
              className={styles.secondary}
              disabled={pending}
              onClick={() => void restore()}
            >
              {pending ? 'Restaurando…' : 'Restaurar evento'}
            </button>
          </LifecycleRow>
        ) : (
          <LifecycleRow title="Archivar evento" hint={archiveHint}>
            <button type="button" className={styles.secondary} onClick={() => open('archive')}>
              Archivar evento
            </button>
          </LifecycleRow>
        )}
        <LifecycleRow title="Eliminar evento" hint={deleteHint} separated>
          {deletable ? (
            <button type="button" className={styles.danger} onClick={() => open('delete')}>
              Eliminar evento
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-11 cursor-not-allowed rounded-lg border border-line bg-surface-inner px-4 py-2 text-sm font-semibold text-muted"
            >
              Eliminar evento
            </button>
          )}
        </LifecycleRow>
        {dialog === 'archive' && (
          <Modal
            role="alertdialog"
            title={`¿Archivar ${event.name}?`}
            isOpen
            onOpenChange={(isOpen) => !isOpen && close()}
            isKeyboardDismissDisabled={pending}
            actions={
              <>
                <Button className={buttonClass('secondary')} isDisabled={pending} onPress={close}>
                  Cancelar
                </Button>
                <Button
                  className={buttonClass('primary')}
                  isDisabled={pending}
                  onPress={() => void archive()}
                >
                  {pending ? 'Archivando…' : 'Archivar evento'}
                </Button>
              </>
            }
          >
            <div className="space-y-4 pb-1">
              {dialogError && <Notice tone="danger">{dialogError}</Notice>}
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {archiveConsequences.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Modal>
        )}
        {dialog === 'delete' && (
          <DeleteDialog
            event={event}
            knownEmpty={availability.kind === 'available'}
            isPending={pending}
            error={dialogError}
            onClose={close}
            onConfirm={(slug) => void remove(slug)}
          />
        )}
      </div>
    </SettingsSection>
  );
}

function LifecycleRow({
  title,
  hint,
  separated = false,
  children,
}: {
  title: string;
  hint: string;
  separated?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-5 sm:px-6 ${separated ? 'border-t border-line' : ''}`}
    >
      <div className="min-w-0 flex-[1_1_280px] space-y-1">
        <p className="text-[15px] leading-[22px] font-bold text-heading">{title}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

type DeleteDialogProps = {
  event: AdminEvent;
  // The foundation said the event is empty; otherwise the API decides.
  knownEmpty: boolean;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (slug: string) => void;
};

// Eliminar un evento vacío: the event's address must be typed exactly before the button works.
function DeleteDialog({
  event,
  knownEmpty,
  isPending,
  error,
  onClose,
  onConfirm,
}: DeleteDialogProps) {
  const [typed, setTyped] = useState('');
  const confirmed = slugConfirmed(typed, event.slug);

  return (
    <Modal
      role="alertdialog"
      title={`¿Eliminar ${event.name}?`}
      description={
        <>
          {knownEmpty
            ? 'Este evento no tiene actividades, pases ni inscripciones, así que se puede eliminar. '
            : 'Solo se puede eliminar si no tiene actividades, pases ni inscripciones. '}
          <strong>No se puede deshacer.</strong> La dirección{' '}
          <span className="font-mono break-all">/e/{event.slug}</span> quedará libre para otro
          evento.
        </>
      }
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      isKeyboardDismissDisabled={isPending}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={isPending} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            className={buttonClass('destructive')}
            isDisabled={isPending || !confirmed}
            onPress={() => onConfirm(typed)}
          >
            {isPending ? 'Eliminando…' : 'Eliminar para siempre'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField
          label="Para confirmar, escribe la dirección del evento"
          hint={`Escribe ${event.slug}`}
          hintPlacement="below"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          disabled={isPending}
          onChange={(changeEvent) => setTyped(changeEvent.currentTarget.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              if (confirmed && !isPending) onConfirm(typed);
            }
          }}
        />
      </div>
    </Modal>
  );
}
