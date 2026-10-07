import {
  archiveActivity,
  catalogFailure,
  createActivity,
  listActivities,
  readCatalogEventContext,
  updateActivity,
  type ActivityInput,
  type CatalogActivity,
} from '@/entities/event-catalog';
import { type ReactNode, useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { ActivityAgendaFilters } from './activity-agenda-filters';
import {
  agendaDays,
  countVisible,
  kindOptions,
  workshopKind,
  type AgendaDay,
  type AgendaFilters,
} from './activity-agenda-model';
import { ActivityForm } from './activity-form';
import { ActivityList } from './activity-list';
import { styles } from './catalog-copy';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { useCatalogLoad } from './use-catalog-load';

type Editor = { mode: 'create' } | { mode: 'edit'; activity: CatalogActivity } | null;

export function AdminEventActivitiesPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <EventActivities key={eventId} eventId={eventId} />;
}

function EventActivities({ eventId }: { eventId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [context, activities] = await Promise.all([
        readCatalogEventContext(eventId, signal),
        listActivities(eventId, signal),
      ]);
      return { context, activities };
    },
    [eventId],
  );
  const { state, reload } = useCatalogLoad(load);
  const [editor, setEditor] = useState<Editor>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filters, setFilters] = useState<AgendaFilters>({
    kind: null,
    query: '',
    showArchived: false,
  });

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setEditor(null);
      setConfirmingId(null);
      setNotice({ kind: 'success', text: success });
      reload();
    } catch (error) {
      setNotice({ kind: 'failure', failure: catalogFailure(error) });
    } finally {
      setBusy(false);
    }
  }

  function save(input: ActivityInput) {
    if (editor?.mode === 'edit') {
      const { id, version } = editor.activity;
      void run(() => updateActivity(eventId, id, version, input), 'Actividad actualizada.');
    } else {
      void run(() => createActivity(eventId, input), 'Actividad creada.');
    }
  }

  function refresh() {
    setEditor(null);
    setConfirmingId(null);
    setNotice(null);
    reload();
  }

  const data = state.status === 'ready' ? state.data : null;
  const refreshFailure = state.status === 'ready' ? state.refreshFailure : null;
  const venueNames = new Map(data?.context.venues.map((venue) => [venue.id, venue.name]));

  function openEditor(next: Editor) {
    setNotice(null);
    setConfirmingId(null);
    setEditor(next);
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-heading">Actividades</h1>
            {data && (
              <p className="mt-1 text-sm text-muted">
                Agenda en hora del evento: {data.context.timeZone}.
              </p>
            )}
          </div>
          {data && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => openEditor({ mode: 'create' })}
            >
              Nueva actividad
            </button>
          )}
        </header>
        {state.status === 'loading' && <p role="status">Cargando actividades…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            <CatalogNotice notice={notice} onReload={refresh} />
            <CatalogRefreshFailure failure={refreshFailure} onRetry={reload} />
            <div
              className={`grid items-start gap-6 ${editor ? 'lg:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}
            >
              {editor && (
                <aside
                  aria-label="Panel de la actividad"
                  className="min-w-0 lg:col-start-2 lg:row-start-1"
                >
                  <ActivityForm
                    key={editor.mode === 'edit' ? editor.activity.id : 'new'}
                    title={editor.mode === 'edit' ? 'Editar actividad' : 'Nueva actividad'}
                    activity={editor.mode === 'edit' ? editor.activity : undefined}
                    venues={data.context.venues}
                    timeZone={data.context.timeZone}
                    busy={busy}
                    onSubmit={save}
                    onCancel={() => setEditor(null)}
                  />
                </aside>
              )}
              <section
                aria-label="Agenda de actividades"
                className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1"
              >
                <ActivityAgendaFilters
                  filters={filters}
                  kinds={kindOptions(data.activities, filters.showArchived, filters.kind)}
                  total={countVisible(data.activities, filters.showArchived)}
                  onChange={setFilters}
                />
                <Agenda
                  activities={data.activities}
                  filters={filters}
                  timeZone={data.context.timeZone}
                >
                  {(days) => (
                    <ActivityList
                      days={days}
                      venueNames={venueNames}
                      timeZone={data.context.timeZone}
                      confirmingId={confirmingId}
                      busy={busy}
                      onEdit={(activity) => openEditor({ mode: 'edit', activity })}
                      onArchiveRequest={(activity) => {
                        setNotice(null);
                        setConfirmingId(activity.id);
                      }}
                      onArchiveConfirm={(activity) =>
                        void run(
                          () => archiveActivity(eventId, activity.id, activity.version),
                          'Actividad archivada.',
                        )
                      }
                      onArchiveCancel={() => setConfirmingId(null)}
                    />
                  )}
                </Agenda>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

type AgendaProps = {
  activities: CatalogActivity[];
  filters: AgendaFilters;
  timeZone: string;
  children: (days: AgendaDay[]) => ReactNode;
};

// Picks the right empty state, or renders the filtered days.
function Agenda({ activities, filters, timeZone, children }: AgendaProps) {
  if (activities.length === 0)
    return <p className="text-muted">Aún no hay actividades para este evento.</p>;
  const noWorkshops =
    filters.kind === workshopKind &&
    !filters.query.trim() &&
    !activities.some((activity) => activity.kind === workshopKind);
  if (noWorkshops)
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
        <h2 className="text-lg font-bold text-heading">Aún no hay talleres</h2>
        <p className="mt-1 text-sm text-muted">
          Se anuncian más adelante. Después de crearlos, marca en Pases a cuáles da acceso cada
          pase.
        </p>
      </div>
    );
  const days = agendaDays(activities, filters, timeZone);
  if (days.length === 0)
    return <p className="text-muted">Ninguna actividad coincide con los filtros.</p>;
  return children(days);
}
