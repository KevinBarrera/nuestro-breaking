import { apiUrl } from '@/shared/api';
import { routes } from '@/shared/config';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

type EventEntry = { id: string; name: string };
type EventListState =
  { status: 'loading' | 'denied' | 'error' } | { status: 'ready'; events: EventEntry[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isEventList(value: unknown): value is EventEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        uuid.test(candidate.id) &&
        typeof candidate.name === 'string' &&
        candidate.name.trim().length > 0
      );
    })
  );
}

const sampleActivities = [
  {
    name: 'Batalla individual',
    kind: 'Batalla',
    schedule: '14 de noviembre, 10:00',
    location: 'Pista principal',
    price: 'Por confirmar',
    capacity: 'Por confirmar',
  },
  {
    name: 'Taller de equipos',
    kind: 'Taller',
    schedule: '14 de noviembre, 14:00',
    location: 'Sala de talleres',
    price: 'Por confirmar',
    capacity: 'Por confirmar',
  },
];

export function AdminPage() {
  const [eventList, setEventList] = useState<EventListState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl('/admin/events'), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          return { status: 'denied' as const };
        }
        if (!response.ok) throw new Error('Event list request failed');
        const value: unknown = await response.json();
        if (!isEventList(value)) throw new Error('Invalid event list');
        return { status: 'ready' as const, events: value };
      })
      .then((result) => {
        if (!controller.signal.aborted) setEventList(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEventList({ status: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-link">
              Nuestro Breaking
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Administración</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Vista preliminar del espacio de administración para el equipo organizador y los
              jueces.
            </p>
          </div>
          <span className="rounded-full border border-line bg-chip px-3 py-1 text-xs font-medium text-link">
            Vista de planificación · Datos de ejemplo
          </span>
        </header>

        <section
          aria-label="Eventos para el control de acceso"
          className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6"
        >
          <h2 className="text-xl font-semibold">Eventos para el control de acceso</h2>
          <p className="mt-2 text-sm text-muted">
            Eventos reales disponibles para tu cuenta. El acceso a cada evento se verifica en el
            servidor.
          </p>
          {eventList.status === 'loading' && (
            <p role="status" className="mt-4">
              Cargando eventos…
            </p>
          )}
          {eventList.status === 'denied' && (
            <p role="alert" className="mt-4 text-warning-fg">
              Acceso denegado a la lista de eventos. No puedes iniciar el control de acceso desde
              aquí.
            </p>
          )}
          {eventList.status === 'error' && (
            <p role="alert" className="mt-4 text-danger-fg">
              No se pudieron cargar los eventos. Inténtalo de nuevo más tarde.
            </p>
          )}
          {eventList.status === 'ready' &&
            (eventList.events.length === 0 ? (
              <p className="mt-4 text-muted">
                No hay eventos disponibles para el control de acceso.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {eventList.events.map((event) => (
                  <li key={event.id}>
                    <Link
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-link hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      to={routes.adminEventCheckIn.replace(':eventId', event.id)}
                    >
                      <span className="min-w-0 break-words">{event.name}</span>
                      <span className="shrink-0 text-sm font-semibold">Control de acceso →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </section>

        {eventList.status === 'ready' && eventList.events.length > 0 && (
          <section
            aria-label="Catálogo de eventos"
            className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6"
          >
            <h2 className="text-xl font-semibold">Catálogo de eventos</h2>
            <p className="mt-2 text-sm text-muted">
              Administra las actividades y los pases de cada evento.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {eventList.events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                >
                  <span className="min-w-0 break-words">{event.name}</span>
                  <span className="flex shrink-0 gap-2">
                    <Link
                      aria-label={`Actividades de ${event.name}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-link hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      to={routes.adminEventActivities.replace(':eventId', event.id)}
                    >
                      Actividades
                    </Link>
                    <Link
                      aria-label={`Pases de ${event.name}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-link hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      to={routes.adminEventPassTypes.replace(':eventId', event.id)}
                    >
                      Pases
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 rounded-lg border border-warning-fg bg-warning px-4 py-3 text-sm text-warning-fg">
          La propuesta del MVP de noviembre sigue en borrador; no está aprobada.
        </p>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-label="Evento de ejemplo" className="min-w-0 space-y-5">
            <article
              aria-labelledby="event-title"
              className="rounded-xl border border-line bg-surface p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-link">
                    Evento de ejemplo
                  </p>
                  <h2
                    id="event-title"
                    className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl"
                  >
                    Fin de semana de breaking
                  </h2>
                </div>
                <span className="rounded-full border border-warning-fg bg-warning px-2.5 py-1 text-xs font-medium text-warning-fg">
                  Borrador
                </span>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Fecha ilustrativa</dt>
                  <dd className="mt-1 font-medium">14 de noviembre</dd>
                </div>
                <div>
                  <dt className="text-muted">Sede</dt>
                  <dd className="mt-1 font-medium">Por confirmar</dd>
                </div>
              </dl>
            </article>

            <section aria-labelledby="activities-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="activities-title" className="text-lg font-semibold">
                  Actividades de ejemplo
                </h3>
                <span className="text-xs text-muted">Dentro del evento · 2 actividades</span>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {sampleActivities.map((activity) => (
                  <article
                    key={activity.name}
                    aria-label={activity.name}
                    className="rounded-xl border border-line bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-base font-semibold">{activity.name}</h4>
                      <span className="rounded-full border border-warning-fg bg-warning px-2.5 py-0.5 text-xs font-medium text-warning-fg">
                        Borrador
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-line pt-4 text-sm">
                      <div>
                        <dt className="text-muted">Tipo</dt>
                        <dd className="mt-0.5 font-medium text-link">{activity.kind}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Horario</dt>
                        <dd className="mt-0.5 font-medium">{activity.schedule}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted">Lugar</dt>
                        <dd className="mt-0.5 font-medium">{activity.location}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Precio</dt>
                        <dd className="mt-0.5 font-medium">{activity.price}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Cupo</dt>
                        <dd className="mt-0.5 font-medium">{activity.capacity}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section
            aria-labelledby="planning-title"
            className="rounded-xl border border-line bg-surface p-5"
          >
            <h2 id="planning-title" className="text-base font-semibold">
              Estado de planificación
            </h2>
            <p className="mt-2 text-sm text-muted">2 actividades de ejemplo</p>
            <div className="mt-4 border-t border-line pt-4">
              <span className="inline-flex rounded-full border border-warning-fg bg-warning px-2.5 py-1 text-xs font-medium text-warning-fg">
                Pendiente de definir
              </span>
              <p className="mt-3 text-sm leading-6 text-muted">
                Los campos que dependen de la organización siguen siendo configurables o quedan
                pendientes de definir.
              </p>
            </div>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-link">
              Información de muestra para planificar, no datos en vivo.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
