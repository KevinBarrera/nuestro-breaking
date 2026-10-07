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
import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { ActivityForm } from './activity-form';
import { ActivityList } from './activity-list';
import { styles } from './catalog-copy';
import { CatalogLoadFailure, CatalogNotice, type Notice } from './catalog-notice';
import { CatalogPageHeader } from './catalog-page-header';
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
  const venueNames = new Map(data?.context.venues.map((venue) => [venue.id, venue.name]));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <CatalogPageHeader eventId={eventId} title="Actividades" current="activities" />
        {state.status === 'loading' && <p role="status">Cargando actividades…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            <CatalogNotice notice={notice} onReload={refresh} />
            {editor ? (
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
            ) : data.context.venues.length === 0 ? (
              <p className="text-amber-200">
                El evento aún no tiene sedes; no se pueden crear actividades.
              </p>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setNotice(null);
                  setConfirmingId(null);
                  setEditor({ mode: 'create' });
                }}
              >
                Nueva actividad
              </button>
            )}
            <section aria-label="Lista de actividades">
              <ActivityList
                activities={data.activities}
                venueNames={venueNames}
                timeZone={data.context.timeZone}
                confirmingId={confirmingId}
                busy={busy}
                onEdit={(activity) => {
                  setNotice(null);
                  setConfirmingId(null);
                  setEditor({ mode: 'edit', activity });
                }}
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
