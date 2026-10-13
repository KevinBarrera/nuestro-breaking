import {
  adminEventFailure,
  getEventFoundation,
  updateEvent,
  type AdminEvent,
  type AdminEventFailure,
  type AdminVenue,
} from '@/entities/admin-event';
import { useSessionStore } from '@/entities/session';
import { FieldError, Notice, Select, TextField, UnsavedChangesGuard } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { styles } from './catalog-copy';
import {
  archivedNotice,
  detailsChanges,
  detailsDraft,
  detailsZoneOptions,
  isDetailsDirty,
  readOnlyNotice,
  savedNotice,
  unknownSaveMessage,
  validateDetails,
} from './event-details-model';
import {
  eventFieldOrder,
  eventServerErrors,
  type EventDetailsDraft,
  type EventErrors,
} from './event-form-model';
import { eventFailureMessage, eventZoneName } from './event-model';
import { VenuesSection } from './venues-section';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: AdminEventFailure }
  | { status: 'ready'; event: AdminEvent; venues: AdminVenue[] };

function loadFailureMessage(failure: AdminEventFailure) {
  if (failure.kind === 'not_found') return 'No encontramos este evento. Revisa el enlace.';
  if (failure.kind === 'unauthorized' || failure.kind === 'forbidden')
    return 'Sin acceso: tu cuenta no puede ver los datos de este evento.';
  return 'No se pudieron cargar los datos del evento. Inténtalo de nuevo.';
}

// Datos del evento (#213 D2, formerly "Fundamentos del evento"): edits the name, time zone and
// dates, shows the slug and folio prefix as fixed, and manages the event's venues (D8). Global
// and event-scoped admins edit; judges, who may read the foundation, get a read-only view.
// An archived event is read-only until it is restored.
export function AdminEventDetailsPage() {
  const { eventId = '' } = useParams<'eventId'>();
  const canEdit = useSessionStore((state) => state.session.user?.roles.includes('admin') === true);
  const [state, setState] = useState<{ eventId: string; load: LoadState }>({
    eventId,
    load: { status: 'loading' },
  });
  const [revision, setRevision] = useState(0);
  // Bumped on each save, so the form starts again from the saved event.
  const [formKey, setFormKey] = useState(0);
  // Both belong to the event they were set for, so switching events drops them.
  const [notice, setNotice] = useState<{ eventId: string; text: string } | null>(null);
  // A write was refused with `event_archived`: someone archived the event meanwhile.
  const [archivedFor, setArchivedFor] = useState<string | null>(null);
  const markArchived = () => setArchivedFor(eventId);

  useEffect(() => {
    const controller = new AbortController();
    getEventFoundation(eventId, controller.signal)
      .then(({ event, venues }) => {
        if (!controller.signal.aborted)
          setState({ eventId, load: { status: 'ready', event, venues } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ eventId, load: { status: 'failed', failure: adminEventFailure(error) } });
      });
    return () => controller.abort();
  }, [eventId, revision]);

  const load: LoadState = state.eventId === eventId ? state.load : { status: 'loading' };
  const ready = load.status === 'ready' ? load : null;
  const archived = archivedFor === eventId || (ready !== null && ready.event.archivedAt !== null);
  const noticeText = notice?.eventId === eventId ? notice.text : null;
  const editable = canEdit && !archived;

  function retry() {
    setState({ eventId, load: { status: 'loading' } });
    setRevision((value) => value + 1);
  }

  function saved(event: AdminEvent) {
    if (!ready) return;
    setState({ eventId, load: { ...ready, event } });
    setFormKey((value) => value + 1);
    setNotice({ eventId, text: savedNotice });
  }

  function venuesChanged(venues: AdminVenue[]) {
    if (ready) setState({ eventId, load: { ...ready, venues } });
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Datos del evento</h1>
          <p className="max-w-2xl text-muted">
            Los cambios se reflejan en la página de compra y en los correos que se envíen después.
          </p>
        </header>
        {load.status === 'loading' && <p role="status">Cargando datos del evento…</p>}
        {load.status === 'failed' && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg"
          >
            <p>{loadFailureMessage(load.failure)}</p>
            {load.failure.kind !== 'not_found' &&
              load.failure.kind !== 'unauthorized' &&
              load.failure.kind !== 'forbidden' && (
                <button type="button" className={styles.secondary} onClick={retry}>
                  Reintentar
                </button>
              )}
          </div>
        )}
        {ready && (
          <>
            {archived && <Notice>{archivedNotice}</Notice>}
            {!archived && !canEdit && <Notice>{readOnlyNotice}</Notice>}
            {noticeText && !archived && <Notice>{noticeText}</Notice>}
            <EventDetailsForm
              key={`${ready.event.id}-${formKey}`}
              event={ready.event}
              editable={editable}
              onSaved={saved}
              onArchived={markArchived}
              onEdit={() => setNotice(null)}
            />
            <VenuesSection
              eventId={ready.event.id}
              venues={ready.venues}
              editable={editable}
              onChange={venuesChanged}
              onArchived={markArchived}
            />
            {/* #213 T10: the "Archivar o eliminar" section goes here. */}
          </>
        )}
      </div>
    </main>
  );
}

type EventDetailsFormProps = {
  event: AdminEvent;
  editable: boolean;
  onSaved: (event: AdminEvent) => void;
  onArchived: () => void;
  // The first edit after a save clears its notice.
  onEdit: () => void;
};

function EventDetailsForm({ event, editable, onSaved, onArchived, onEdit }: EventDetailsFormProps) {
  const [initial] = useState(() => detailsDraft(event));
  const [draft, setDraft] = useState<EventDetailsDraft>(initial);
  const [errors, setErrors] = useState<EventErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusAfterSave = useRef<string | null>(null);
  const lockedId = useId();
  const dirty = isDetailsDirty(initial, draft);
  const zoneOptions = detailsZoneOptions(event.timeZone);

  useEffect(() => {
    if (saving || !focusAfterSave.current) return;
    formRef.current?.querySelector<HTMLElement>(`input[name="${focusAfterSave.current}"]`)?.focus();
    focusAfterSave.current = null;
  }, [saving]);

  const set = (changes: Partial<EventDetailsDraft>) => {
    onEdit();
    setDraft((previous) => ({ ...previous, ...changes }));
  };

  function discard() {
    setDraft(initial);
    setErrors({});
    setFailure(null);
  }

  const firstError = (found: EventErrors) => eventFieldOrder.find((field) => found[field]);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (pending.current || !editable || !dirty) return;
    const found = validateDetails(event, draft);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      formEvent.currentTarget
        .querySelector<HTMLElement>(`input[name="${firstError(found)}"]`)
        ?.focus();
      return;
    }
    const changes = detailsChanges(event, draft);
    // Only spacing around the name changed: nothing to send.
    if (Object.keys(changes).length === 0) return onSaved(event);
    pending.current = true;
    setSaving(true);
    try {
      onSaved(await updateEvent(event.id, changes));
    } catch (error) {
      const reason = adminEventFailure(error);
      if (reason.kind === 'rule' && reason.code === 'event_archived') return onArchived();
      if (reason.kind === 'invalid') {
        const fromServer = eventServerErrors(reason.fieldErrors);
        setErrors(fromServer);
        focusAfterSave.current = firstError(fromServer) ?? null;
      }
      setFailure(reason.kind === 'unknown' ? unknownSaveMessage : eventFailureMessage(reason));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  const locked = !editable || saving;

  return (
    <form
      ref={formRef}
      aria-label="Datos del evento"
      noValidate
      onSubmit={(formEvent) => void submit(formEvent)}
      className={`${styles.card} space-y-6 sm:p-8`}
    >
      <UnsavedChangesGuard when={editable && dirty && !saving} />
      {failure && <Notice tone="danger">{failure}</Notice>}
      <TextField
        label="Nombre del evento"
        name="name"
        autoComplete="off"
        hint="Así aparece en el panel, en la página de compra y en los correos."
        hintPlacement="below"
        value={draft.name}
        error={errors.name}
        readOnly={locked}
        onChange={(changeEvent) => set({ name: changeEvent.currentTarget.value })}
      />
      <div className="max-w-md">
        <Select
          label="Zona horaria"
          name="timeZone"
          options={zoneOptions}
          selectedKey={draft.timeZone}
          onSelectionChange={(timeZone) => set({ timeZone })}
          isDisabled={locked}
        />
        <p className="mt-1 text-sm text-muted">Los horarios del evento se muestran en esta zona.</p>
        {errors.timeZone && <FieldError>{errors.timeZone}</FieldError>}
      </div>
      {/* `min-w-0`: a fieldset defaults to its content width, and datetime inputs are wide. */}
      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-fg">
          Fechas del evento <span className="font-normal text-muted">(opcional)</span>
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Inicio"
            name="startsAt"
            type="datetime-local"
            value={draft.startsAt}
            error={errors.startsAt}
            readOnly={locked}
            onChange={(changeEvent) => set({ startsAt: changeEvent.currentTarget.value })}
          />
          <TextField
            label="Fin"
            name="endsAt"
            type="datetime-local"
            value={draft.endsAt}
            error={errors.endsAt}
            readOnly={locked}
            onChange={(changeEvent) => set({ endsAt: changeEvent.currentTarget.value })}
          />
        </div>
        <p className="text-sm text-muted">
          En la hora de {eventZoneName(draft.timeZone)}. Llena las dos o déjalas vacías.
        </p>
      </fieldset>
      <section
        aria-labelledby={lockedId}
        className="space-y-4 rounded-xl border border-line bg-surface-inner p-5"
      >
        <h2 id={lockedId} className="flex items-center gap-2.5 text-base font-bold text-fg">
          <LockIcon />
          Fijos desde la creación
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <dt className="text-sm text-muted">Dirección de la página de compra</dt>
            <dd className="font-mono break-all text-fg">/e/{event.slug}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted">Prefijo de folio</dt>
            <dd className="font-mono text-fg">{event.folioPrefix}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted">
          La dirección puede estar ya compartida y los folios emitidos usan este prefijo.
        </p>
      </section>
      {editable && (
        <div className="flex flex-col-reverse gap-3 border-t border-row pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={discard}
            className={styles.secondary}
          >
            Descartar cambios
          </button>
          <button type="submit" disabled={!dirty || saving} className={styles.primary}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </form>
  );
}

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-muted"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
