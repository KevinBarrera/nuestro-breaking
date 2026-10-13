import { restoreEvent, adminEventFailure, type AdminEvent } from '@/entities/admin-event';
import { useSessionStore } from '@/entities/session';
import { isEventListRequest } from '@/widgets/admin-shell';
import { routes } from '@/shared/config';
import { Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { styles } from './catalog-copy';
import {
  eventDates,
  eventFailureMessage,
  eventZoneName,
  folioPattern,
  landingRedirect,
  restoredNotice,
  salesChip,
  splitEvents,
} from './event-model';
import { listNotice } from './event-lifecycle-model';
import { useEventList } from './use-event-list';

const eventPath = (pattern: string, eventId: string) => pattern.replace(':eventId', eventId);

const createLink = `${styles.primary} inline-flex items-center justify-center gap-2 px-5 text-base font-bold`;

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CreateEventLink() {
  return (
    <Link to={routes.adminEventNew} className={createLink}>
      <PlusIcon />
      Crear evento
    </Link>
  );
}

type Message = { tone: 'info' | 'danger'; text: string };

// The /admin landing: the events this account may operate, from GET /admin/events only.
// Global admins also create events here and restore archived ones (#213). For everyone else,
// exactly one event means nothing to choose, so it opens that event's overview, unless they
// asked for the list from the shell ("Todos los eventos" or the brand).
export function AdminPage() {
  const globalAdmin = useSessionStore((state) => state.session.user?.globalAdmin === true);
  const { state, reload } = useEventList(globalAdmin);
  const [showArchived, setShowArchived] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // Datos del evento comes back here after archiving or deleting, with a notice (#213 T10).
  const arrivalNotice = listNotice(location.state);
  const [message, setMessage] = useState<Message | null>(() =>
    arrivalNotice ? { tone: 'info', text: arrivalNotice } : null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const archivedId = useId();

  // The notice is shown once: it is dropped from the history entry, so a reload does not
  // repeat it.
  useEffect(() => {
    if (arrivalNotice) void navigate('.', { replace: true, state: null });
  }, [arrivalNotice, navigate]);

  const { active, archived } =
    state.status === 'ready' ? splitEvents(state.events) : { active: [], archived: [] };
  const redirect =
    state.status === 'ready' && !isEventListRequest(location.state)
      ? landingRedirect(active, globalAdmin)
      : null;
  if (redirect) return <Navigate replace to={eventPath(routes.adminEventOverview, redirect)} />;

  const empty = state.status === 'ready' && active.length === 0;

  async function restore(event: AdminEvent) {
    if (restoring) return;
    setRestoring(event.id);
    setMessage(null);
    try {
      await restoreEvent(event.id);
      setMessage({ tone: 'info', text: restoredNotice(event.name) });
      // The restored card leaves the archived list, so focus moves to a stable target.
      heading.current?.focus();
    } catch (error) {
      setMessage({ tone: 'danger', text: eventFailureMessage(adminEventFailure(error)) });
    } finally {
      setRestoring(null);
      reload();
    }
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
              Administración
            </p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-heading outline-none"
            >
              Eventos
            </h1>
            <p className="max-w-2xl text-muted">
              {globalAdmin
                ? 'Elige el evento que vas a operar o crea uno nuevo.'
                : 'Elige el evento que vas a operar. Todo lo demás del panel trabaja dentro de ese evento.'}
            </p>
          </div>
          {globalAdmin && !empty && <CreateEventLink />}
        </header>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {state.status === 'ready' && state.refreshFailed && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg"
          >
            <p>No se pudo actualizar la lista de eventos; puede no estar al día.</p>
            <button type="button" className={styles.secondary} onClick={reload}>
              Reintentar
            </button>
          </div>
        )}
        {state.status === 'loading' && <p role="status">Cargando eventos…</p>}
        {state.status === 'failed' &&
          (state.failure.kind === 'unauthorized' || state.failure.kind === 'forbidden' ? (
            <p
              role="alert"
              className="rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg"
            >
              Sin acceso: tu cuenta no puede ver la lista de eventos.
            </p>
          ) : (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg"
            >
              <p>No se pudieron cargar los eventos. Inténtalo de nuevo.</p>
              <button type="button" className={styles.secondary} onClick={reload}>
                Reintentar
              </button>
            </div>
          ))}
        {state.status === 'ready' &&
          (empty ? (
            globalAdmin ? (
              <FirstEvent hasArchived={archived.length > 0} />
            ) : (
              <div className="space-y-1 text-muted">
                <p>No hay eventos disponibles para tu cuenta.</p>
                <p>Pide a una persona con acceso a todos los eventos que te dé acceso.</p>
              </div>
            )
          ) : (
            <ul aria-label="Eventos" className="flex flex-col gap-3.5">
              {active.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          ))}
        {state.status === 'ready' && globalAdmin && archived.length > 0 && (
          <div className="space-y-3.5">
            <button
              type="button"
              aria-expanded={showArchived}
              aria-controls={archivedId}
              onClick={() => setShowArchived((value) => !value)}
              className={`${styles.secondary} inline-flex items-center gap-2 bg-surface`}
            >
              <ArchiveIcon />
              Archivados ({archived.length})
            </button>
            {showArchived && (
              <ul id={archivedId} aria-label="Eventos archivados" className="flex flex-col gap-3.5">
                {archived.map((event) => (
                  <li key={event.id}>
                    <ArchivedEventCard
                      event={event}
                      restoring={restoring === event.id}
                      disabled={restoring !== null}
                      onRestore={() => void restore(event)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const steps = [
  'Agregar competencias y workshops',
  'Crear los pases y sus precios',
  'Abrir la venta en línea y operar el check-in',
];

// First run: no event yet, so the next step is creating one.
function FirstEvent({ hasArchived }: { hasArchived: boolean }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`${styles.card} max-w-2xl space-y-5 sm:p-8`}>
      <div className="space-y-2">
        <h2 id={titleId} className="text-2xl font-extrabold tracking-tight text-heading">
          {hasArchived ? 'No hay eventos activos' : 'Aún no hay eventos'}
        </h2>
        <p className="text-fg">
          {hasArchived
            ? 'Crea un evento nuevo o restaura uno archivado. Después de crearlo podrás:'
            : 'Crea el primer evento para empezar a configurarlo. Después de crearlo podrás:'}
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-chip-selected text-sm font-bold text-chip-selected-fg"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <CreateEventLink />
    </section>
  );
}

function EventMeta({ event, id }: { event: AdminEvent; id?: string }) {
  return (
    <span id={id} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <span>{eventDates(event)}</span>
      <span>{eventZoneName(event.timeZone)}</span>
      <span className="font-mono break-all">/e/{event.slug}</span>
      <span>
        Folios <span className="font-mono">{folioPattern(event.folioPrefix)}</span>
      </span>
    </span>
  );
}

// The whole card opens the event's overview. Its name is the link name; the dates, zone,
// address, folio prefix and sales chip describe it.
function EventCard({ event }: { event: AdminEvent }) {
  const nameId = useId();
  const metaId = useId();
  const salesId = useId();
  return (
    <Link
      to={eventPath(routes.adminEventOverview, event.id)}
      aria-labelledby={nameId}
      aria-describedby={`${metaId} ${salesId}`}
      className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-5 text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-6"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span id={nameId} className="text-lg font-bold break-words">
          {event.name}
        </span>
        <EventMeta event={event} id={metaId} />
      </span>
      <SalesChipBadge salesEnabled={event.salesEnabled} id={salesId} />
      <ChevronIcon />
    </Link>
  );
}

const chipTone = {
  open: 'bg-success text-success-fg',
  closed: 'bg-chip text-fg',
} as const;

function SalesChipBadge({ salesEnabled, id }: { salesEnabled: boolean; id?: string }) {
  const chip = salesChip(salesEnabled);
  return (
    <span
      id={id}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap ${chipTone[chip.tone]}`}
    >
      {chip.label}
    </span>
  );
}

type ArchivedEventCardProps = {
  event: AdminEvent;
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
};

function ArchivedEventCard({ event, restoring, disabled, onRestore }: ArchivedEventCardProps) {
  const nameId = useId();
  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-5 py-5 sm:px-6"
    >
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-2">
        <h3 id={nameId} className="text-lg font-bold break-words text-heading">
          {event.name}
        </h3>
        <EventMeta event={event} />
      </div>
      <span className="rounded-full bg-chip px-3 py-1.5 text-sm font-bold whitespace-nowrap text-fg">
        Archivado
      </span>
      <button
        type="button"
        aria-label={`Restaurar ${event.name}`}
        disabled={disabled}
        onClick={onRestore}
        className={styles.secondary}
      >
        {restoring ? 'Restaurando…' : 'Restaurar'}
      </button>
    </article>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 text-muted"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ArchiveIcon() {
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
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  );
}
