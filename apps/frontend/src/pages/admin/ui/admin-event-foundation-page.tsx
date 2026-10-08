import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { apiUrl } from '@/shared/api';

type EventFoundation = {
  event: {
    id: string;
    name: string;
    timeZone: string;
    startsAt: string | null;
    endsAt: string | null;
    windowStatus: 'bounded' | 'unbounded';
  };
  venues: { id: string; name: string }[];
  activities: {
    id: string;
    name: string;
    kind: string;
    venueId: string;
    startsAt: string;
    endsAt: string;
    planningStatus: 'draft';
  }[];
  deferredFields: string[];
};

type LoadState =
  | { status: 'loading'; eventId?: string }
  | { status: 'failure'; eventId: string }
  | { status: 'success'; eventId: string; foundation: EventFoundation };

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

function formatWindow(event: EventFoundation['event']) {
  if (event.windowStatus === 'unbounded') {
    return 'Sin fechas definidas';
  }
  const start = event.startsAt ? formatDate(event.startsAt, event.timeZone) : 'Sin inicio';
  const end = event.endsAt ? formatDate(event.endsAt, event.timeZone) : 'Sin fin';
  return `${start} — ${end}`;
}

export function AdminEventFoundationPage() {
  const { eventId } = useParams<'eventId'>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!eventId) {
      return;
    }

    const controller = new AbortController();
    void fetch(apiUrl(`/admin/events/${encodeURIComponent(eventId)}/foundation`), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Foundation request failed');
        }
        return (await response.json()) as EventFoundation;
      })
      .then((foundation) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', eventId, foundation });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'failure', eventId });
        }
      });

    return () => controller.abort();
  }, [eventId]);

  const currentState = state.eventId === eventId ? state : { status: 'loading' as const };
  const foundation = currentState.status === 'success' ? currentState.foundation : null;
  const venueNames = new Map(foundation?.venues.map((venue) => [venue.id, venue.name]));

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-b border-line pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-link">
            Los más pesados · Administración
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Fundamentos del evento</h1>
          <p className="mt-3 text-sm text-warning-fg">
            Datos del endpoint · No aprueban la propuesta del MVP
          </p>
        </header>

        {currentState.status === 'loading' && <p role="status">Cargando datos del evento…</p>}
        {currentState.status === 'failure' && (
          <p role="alert" className="rounded-lg border border-danger-fg bg-danger p-4">
            No se pudo cargar la información del evento. Comprueba el enlace o inténtalo más tarde.
          </p>
        )}
        {foundation && (
          <>
            <section aria-label="Evento" className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-2xl font-semibold">{foundation.event.name}</h2>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Zona horaria</dt>
                  <dd>{foundation.event.timeZone}</dd>
                </div>
                <div>
                  <dt className="text-muted">Ventana del evento</dt>
                  <dd>{formatWindow(foundation.event)}</dd>
                </div>
              </dl>
            </section>

            <section aria-label="Sedes" className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-xl font-semibold">Sedes</h2>
              {foundation.venues.length === 0 ? (
                <p className="mt-3 text-muted">Aún no hay sedes para este evento.</p>
              ) : (
                <ul className="mt-3 list-inside list-disc text-muted">
                  {foundation.venues.map((venue) => (
                    <li key={venue.id}>{venue.name}</li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Actividades">
              <h2 className="text-xl font-semibold">Actividades</h2>
              {foundation.activities.length === 0 ? (
                <p className="mt-3 text-muted">Aún no hay actividades para este evento.</p>
              ) : (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {foundation.activities.map((activity) => (
                    <article
                      key={activity.id}
                      className="rounded-xl border border-line bg-surface p-5"
                    >
                      <h3 className="text-lg font-semibold">{activity.name}</h3>
                      <p className="mt-2 text-sm text-warning-fg">Borrador</p>
                      <dl className="mt-4 space-y-2 text-sm">
                        <div>
                          <dt className="text-muted">Tipo</dt>
                          <dd>{activity.kind}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Sede</dt>
                          <dd>{venueNames.get(activity.venueId) ?? 'Sede no disponible'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Inicio</dt>
                          <dd>{formatDate(activity.startsAt, foundation.event.timeZone)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Fin</dt>
                          <dd>{formatDate(activity.endsAt, foundation.event.timeZone)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <p className="text-sm text-muted">
              Precio, cupo y requisitos de inscripción: pendientes de definir en el endpoint.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
