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
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  countryOptionsFor,
  eventFieldOrder,
  eventServerErrors,
  sampleFolio,
  type EventDetailsDraft,
  type EventErrors,
} from './event-form-model';
import {
  withDeleteBlockers,
  withEvent,
  withVenues,
  type DetailsState,
} from './event-details-state';
import { restoredHereNotice } from './event-lifecycle-model';
import { EventLifecycleSection } from './event-lifecycle-section';
import { eventFailureMessage, eventZoneName } from './event-model';
import { CopyIcon, CopyStatus } from './copy-text';
import { LocationFields } from './location-fields';
import { SettingsSection, settingsCard } from './settings-section';
import { useCopyText } from './use-copy-text';
import { VenuesSection } from './venues-section';

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
  const globalAdmin = useSessionStore((state) => state.session.user?.globalAdmin === true);
  const [state, setState] = useState<DetailsState>({ eventId, load: { status: 'loading' } });
  const [revision, setRevision] = useState(0);
  // Both belong to the event they were set for, so switching events drops them.
  const [notice, setNotice] = useState<{ eventId: string; text: string } | null>(null);
  // A write was refused with `event_archived`: someone archived the event meanwhile.
  const [archivedFor, setArchivedFor] = useState<string | null>(null);
  // Said before a reload (an archive whose answer was lost); it outlives the reload.
  const [staleNotice, setStaleNotice] = useState<{ eventId: string; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEventFoundation(eventId, controller.signal)
      .then(({ event, venues, deleteBlockers }) => {
        if (!controller.signal.aborted)
          setState({ eventId, load: { status: 'ready', event, venues, deleteBlockers, saves: 0 } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ eventId, load: { status: 'failed', failure: adminEventFailure(error) } });
      });
    return () => controller.abort();
  }, [eventId, revision]);

  const load = state.eventId === eventId ? state.load : { status: 'loading' as const };
  const ready = load.status === 'ready' ? load : null;
  const archived = archivedFor === eventId || (ready !== null && ready.event.archivedAt !== null);
  const noticeText = notice?.eventId === eventId ? notice.text : null;
  const staleText = staleNotice?.eventId === eventId ? staleNotice.text : null;
  const editable = canEdit && !archived;

  function retry() {
    setState({ eventId, load: { status: 'loading' } });
    setRevision((value) => value + 1);
  }

  // Archived or restored elsewhere: read the event again; the reload decides the state.
  function reloadEvent(message?: string) {
    setArchivedFor(null);
    setStaleNotice(message ? { eventId, text: message } : null);
    retry();
  }

  // Answers may arrive after other writes or after switching events, so they go through the
  // latest state and are dropped for an event that is no longer shown (`event-details-state`).
  function saved(event: AdminEvent) {
    setStaleNotice(null);
    setState((previous) => withEvent(previous, event));
    setNotice({ eventId: event.id, text: savedNotice });
  }

  function restored(event: AdminEvent) {
    setArchivedFor(null);
    setStaleNotice(null);
    setState((previous) => withEvent(previous, event));
    setNotice({ eventId: event.id, text: restoredHereNotice });
  }

  function venuesChanged(venueEventId: string, update: (venues: AdminVenue[]) => AdminVenue[]) {
    setState((previous) => withVenues(previous, venueEventId, update));
  }

  return (
    <main className="px-4 pt-10 pb-16 text-fg sm:px-8">
      <div className="mx-auto max-w-[1080px]">
        <header className="space-y-1.5 pb-8">
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
            {(staleText || archived || !canEdit || noticeText) && (
              <div className="space-y-3 pb-6">
                {staleText && <Notice tone="danger">{staleText}</Notice>}
                {archived && <Notice>{archivedNotice(globalAdmin)}</Notice>}
                {!archived && !canEdit && <Notice>{readOnlyNotice}</Notice>}
                {noticeText && !archived && <Notice>{noticeText}</Notice>}
              </div>
            )}
            <EventDetailsForm
              key={`${ready.event.id}-${ready.saves}`}
              event={ready.event}
              editable={editable}
              onSaved={saved}
              onArchived={() => setArchivedFor(ready.event.id)}
              onEdit={() => setNotice(null)}
            >
              <VenuesSection
                key={`venues-${ready.event.id}`}
                eventId={ready.event.id}
                venues={ready.venues}
                editable={editable}
                onChange={venuesChanged}
                onArchived={() => setArchivedFor(ready.event.id)}
              />
              {globalAdmin && (
                <EventLifecycleSection
                  key={`lifecycle-${ready.event.id}`}
                  event={ready.event}
                  archived={archived}
                  deleteBlockers={ready.deleteBlockers}
                  onRestored={restored}
                  onNotEmpty={(blockers) =>
                    setState((previous) => withDeleteBlockers(previous, ready.event.id, blockers))
                  }
                  onStale={reloadEvent}
                />
              )}
            </EventDetailsForm>
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
  // The sections after General and Identificadores (Sedes, Archivar o eliminar), so the unsaved
  // changes bar sits after them all.
  children: ReactNode;
};

function EventDetailsForm({
  event,
  editable,
  onSaved,
  onArchived,
  onEdit,
  children,
}: EventDetailsFormProps) {
  const [initial] = useState(() => detailsDraft(event));
  const [draft, setDraft] = useState<EventDetailsDraft>(initial);
  const [errors, setErrors] = useState<EventErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusAfterSave = useRef<string | null>(null);
  const formId = useId();
  const generalId = useId();
  const dirty = isDetailsDirty(initial, draft);
  const zoneOptions = detailsZoneOptions(event.timeZone);
  const countries = countryOptionsFor(event.country);

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
    <>
      <SettingsSection
        headingId={generalId}
        title="General"
        description="Nombre, ubicación, zona horaria y fechas. Puedes editarlos cuando quieras."
      >
        <form
          ref={formRef}
          id={formId}
          aria-label="Datos del evento"
          noValidate
          onSubmit={(formEvent) => void submit(formEvent)}
          className={`${settingsCard} space-y-[22px] p-5 sm:p-6`}
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
          <LocationFields
            value={draft}
            errors={errors}
            countries={countries}
            locked={locked}
            lockMode="readOnly"
            onChange={set}
          />
          <div>
            <Select
              label="Zona horaria"
              name="timeZone"
              options={zoneOptions}
              selectedKey={draft.timeZone}
              onSelectionChange={(timeZone) => set({ timeZone })}
              isDisabled={locked}
            />
            <p className="mt-1 text-sm text-muted">
              Los horarios del evento se muestran en esta zona.
            </p>
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
        </form>
      </SettingsSection>
      <IdentifiersSection event={event} />
      {children}
      {editable && dirty && <UnsavedBar formId={formId} saving={saving} onDiscard={discard} />}
    </>
  );
}

// The address and folio prefix are fixed once the event exists (#213); the address can be copied.
function IdentifiersSection({ event }: { event: AdminEvent }) {
  const headingId = useId();
  const copy = useCopyText();
  const path = `/e/${event.slug}`;
  return (
    <SettingsSection
      headingId={headingId}
      title={
        <>
          <LockIcon />
          Identificadores
        </>
      }
      description="Fijos desde la creación: la dirección puede estar ya compartida y los folios emitidos usan este prefijo."
    >
      <div className={`${settingsCard} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
            <p className="text-sm text-muted">Dirección de la página de compra</p>
            <p className="truncate font-mono text-sm text-heading">{path}</p>
          </div>
          <div>
            <button
              type="button"
              className={`${styles.secondary} inline-flex items-center gap-1.5 border-input-line bg-surface`}
              onClick={() => void copy.copy(`${window.location.origin}${path}`)}
            >
              <CopyIcon />
              {copy.state === 'copied' ? 'Copiada' : 'Copiar'}
            </button>
            <CopyStatus state={copy.state} />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-5 py-4 sm:px-6">
          <p className="text-sm text-muted">Prefijo de folio</p>
          <p className="text-sm">
            <span className="font-mono font-medium text-heading">{event.folioPrefix}</span>{' '}
            <span className="text-muted">· por ejemplo </span>
            <span className="font-mono text-heading">{sampleFolio(event.folioPrefix)}</span>
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

type UnsavedBarProps = { formId: string; saving: boolean; onDiscard: () => void };

// Sticks to the bottom of the screen while General has edits; its buttons act on that form.
function UnsavedBar({ formId, saving, onDiscard }: UnsavedBarProps) {
  return (
    <div
      role="region"
      aria-label="Cambios sin guardar"
      className="sticky bottom-4 z-10 mt-2 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-nav-active py-3 pr-3 pl-5 text-nav-active-fg shadow-lg"
    >
      <p className="flex-[1_1_200px] text-sm font-semibold">Tienes cambios sin guardar</p>
      <button
        type="button"
        disabled={saving}
        onClick={onDiscard}
        className="min-h-11 rounded-lg border border-header-line px-4 text-sm font-semibold hover:bg-header-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
      >
        Descartar
      </button>
      <button type="submit" form={formId} disabled={saving} className={styles.primary}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
