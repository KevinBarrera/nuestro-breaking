import {
  CatalogError,
  listCatalogEvents,
  type CatalogEventSummary,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { useId } from 'react';
import { Link, Navigate } from 'react-router';
import { styles } from './catalog-copy';
import { useCatalogLoad } from './use-catalog-load';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Event IDs become route segments, so a list with any malformed ID is rejected as a whole.
async function loadEvents(signal: AbortSignal): Promise<CatalogEventSummary[]> {
  const events = await listCatalogEvents(signal);
  if (!events.every((event) => uuid.test(event.id) && event.name.trim().length > 0))
    throw new CatalogError('error');
  return events;
}

const eventPath = (pattern: string, eventId: string) => pattern.replace(':eventId', eventId);

const sectionLinks = [
  { label: 'Check-in', pattern: routes.adminEventCheckIn },
  { label: 'Actividades', pattern: routes.adminEventActivities },
  { label: 'Pases', pattern: routes.adminEventPassTypes },
];

// The /admin landing: the events this account may operate, from GET /admin/events only.
// With exactly one event there is nothing to choose, so it opens that event's overview.
export function AdminPage() {
  const { state, reload } = useCatalogLoad(loadEvents);

  if (state.status === 'ready' && state.data.length === 1)
    return <Navigate replace to={eventPath(routes.adminEventOverview, state.data[0].id)} />;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Administración</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Eventos</h1>
          <p className="max-w-2xl text-muted">
            Elige el evento que vas a operar. Todo lo demás del panel trabaja dentro de ese evento.
          </p>
        </header>
        {state.status === 'loading' && <p role="status">Cargando eventos…</p>}
        {state.status === 'failed' &&
          (state.failure === 'denied' ? (
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
          (state.data.length === 0 ? (
            <p className="text-muted">No hay eventos disponibles para tu cuenta.</p>
          ) : (
            <ul
              aria-label="Eventos"
              className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4"
            >
              {state.data.map((event) => (
                <li key={event.id} className="flex">
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </main>
  );
}

const sectionLink =
  'inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-link hover:text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function EventCard({ event }: { event: CatalogEventSummary }) {
  const titleId = useId();
  return (
    <article aria-labelledby={titleId} className={`${styles.card} flex flex-1 flex-col gap-4`}>
      <h2 id={titleId} className="text-xl leading-tight font-extrabold break-words text-heading">
        {event.name}
      </h2>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          to={eventPath(routes.adminEventOverview, event.id)}
          className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 font-extrabold text-primary-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Abrir evento
        </Link>
        {sectionLinks.map((section) => (
          <Link
            key={section.label}
            to={eventPath(section.pattern, event.id)}
            className={sectionLink}
          >
            {section.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
