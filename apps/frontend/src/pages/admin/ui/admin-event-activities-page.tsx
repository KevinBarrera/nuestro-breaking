import { fetchAttendeeLists } from '@/entities/attendee-list';
import {
  activityWindowProblem,
  archiveActivity,
  catalogFailure,
  createActivity,
  listActivities,
  listPassTypes,
  readCatalogEventContext,
  restoreActivity,
  updateActivity,
  type ActivityInput,
  type ActivityWindowProblem,
  type CatalogActivity,
  type CatalogFailure,
} from '@/entities/event-catalog';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ActivityAgendaFilters } from './activity-agenda-filters';
import {
  agendaDays,
  agendaFooter,
  agendaPanelId,
  agendaTabId,
  enrolledCount,
  enrollmentCounts,
  kindOptions,
  passNames,
  tabCounts,
  type AgendaDay,
  type AgendaFilters,
} from './activity-agenda-model';
import {
  ActivitiesEmpty,
  ActivityArchiveDialog,
  ActivitySuccessNotice,
  AgendaEmpty,
} from './activity-feedback';
import { PlusIcon } from './activity-icons';
import { ActivityEditor } from './activity-editor';
import { ActivityList } from './activity-list';
import { activityRestoreConflict, styles } from './catalog-copy';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { useCatalogLoad } from './use-catalog-load';

type Editor = { mode: 'create' } | { mode: 'edit'; activity: CatalogActivity } | null;
// A confirmed write. Archive and restore can be undone with the opposite call, using the
// version the server returned.
type Success = {
  text: string;
  undo?: { action: 'archive' | 'restore'; activity: CatalogActivity };
};
type RunOptions<T> = {
  success: (result: T) => Success | null;
  // Safe copy for a 409 that is more specific than the generic conflict message.
  conflict?: string;
};

// A stale or missing record cannot be saved from these values, so its alert (with "Recargar")
// belongs on the page, not inside a dialog the person would have to close first.
const needsReload = (failure: CatalogFailure) => failure === 'conflict' || failure === 'not-found';

const archivedText = (activity: CatalogActivity) => `Archivaste ${activity.name}.`;
const restoredText = (activity: CatalogActivity) =>
  `Restauraste ${activity.name}. Vuelve a aparecer en los pases que la incluyen.`;

export function AdminEventActivitiesPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <EventActivities key={eventId} eventId={eventId} />;
}

function EventActivities({ eventId }: { eventId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [context, activities, enrolled, passTypes] = await Promise.all([
        readCatalogEventContext(eventId, signal),
        listActivities(eventId, signal),
        // Inscritos come from the attendee-lists snapshot and the passes per activity from the
        // pass types; without them the column and the edit summary leave that part out.
        fetchAttendeeLists(eventId, signal).then(enrollmentCounts, () => null),
        listPassTypes(eventId, signal).catch(() => null),
      ]);
      return { context, activities, enrolled, passTypes };
    },
    [eventId],
  );
  const { state, reload, update } = useCatalogLoad(load);
  const tabsId = useId();
  const [editor, setEditor] = useState<Editor>(null);
  const [archiving, setArchiving] = useState<CatalogActivity | null>(null);
  const [busy, setBusy] = useState(false);
  // The last server answer that named the failing fields of an activity window (#295).
  const [windowProblem, setWindowProblem] = useState<ActivityWindowProblem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [filters, setFilters] = useState<AgendaFilters>({ tab: 'active', kind: null, query: '' });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // An archived or restored row leaves the tab, taking the button that started it, so the
  // heading takes the focus on the next frame (after a dialog's own focus restore) and the
  // notice under it is announced.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  async function run<T>(action: () => Promise<T>, { success: done, conflict }: RunOptions<T>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setSuccess(null);
    try {
      const result = await action();
      setEditor(null);
      setArchiving(null);
      setSuccess(done(result));
      reload();
    } catch (error) {
      const problem = activityWindowProblem(error);
      if (problem) {
        // The form marks the fields and its limits follow the event dates the server just read.
        setWindowProblem(problem);
        update((current) => ({
          ...current,
          context: { ...current.context, eventWindow: problem.eventWindow },
        }));
        return;
      }
      const failure = catalogFailure(error);
      const text = failure === 'conflict' ? conflict : undefined;
      setNotice({ kind: 'failure', failure, ...(text && { text }) });
      // Other failures stay in the editor with the edits intact, where the alert is shown.
      setArchiving(null);
      if (needsReload(failure)) setEditor(null);
    } finally {
      setBusy(false);
    }
  }

  // Shows the confirmed row in its new tab right away; the reload that follows refreshes the
  // rest of the agenda.
  function replace(changed: CatalogActivity) {
    update((current) => ({
      ...current,
      activities: current.activities.map((activity) =>
        activity.id === changed.id ? changed : activity,
      ),
    }));
    setFocusRequest((value) => value + 1);
  }

  function archive(activity: CatalogActivity, undo?: boolean) {
    void run(() => archiveActivity(eventId, activity.id, activity.version), {
      success: (archived) => {
        replace(archived);
        return undo
          ? null
          : { text: archivedText(archived), undo: { action: 'restore', activity: archived } };
      },
    });
  }

  function restore(activity: CatalogActivity, undo?: boolean) {
    void run(() => restoreActivity(eventId, activity.id, activity.version), {
      success: (restored) => {
        replace(restored);
        return undo
          ? null
          : { text: restoredText(restored), undo: { action: 'archive', activity: restored } };
      },
      conflict: activityRestoreConflict,
    });
  }

  const undo =
    ({ action, activity }: NonNullable<Success['undo']>) =>
    () =>
      action === 'restore' ? restore(activity, true) : archive(activity, true);

  function save(input: ActivityInput) {
    if (editor?.mode === 'edit') {
      const { id, version } = editor.activity;
      void run(() => updateActivity(eventId, id, version, input), {
        success: () => ({ text: `Guardaste los cambios de ${input.name}.` }),
      });
    } else {
      void run(() => createActivity(eventId, input), {
        success: () => {
          setFilters((current) => ({ ...current, tab: 'active' }));
          return { text: `Creaste ${input.name}. Agrégala a un pase para que se pueda vender.` };
        },
      });
    }
  }

  function refresh() {
    closeEditor();
    reload();
  }

  const data = state.status === 'ready' ? state.data : null;
  const refreshFailure = state.status === 'ready' ? state.refreshFailure : null;
  const venueNames = new Map(data?.context.venues.map((venue) => [venue.id, venue.name]));

  // The "Deshacer" notice goes away too: an undo after an edit would send an older version.
  function openEditor(next: Editor) {
    setNotice(null);
    setSuccess(null);
    setWindowProblem(null);
    setEditor(next);
  }

  // Esc and "Cancelar" discard the edits: the form unmounts and the dialog returns focus to the
  // button that opened it.
  function closeEditor() {
    setNotice(null);
    setEditor(null);
  }

  const openCreate = () => openEditor({ mode: 'create' });

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="mx-auto max-w-[1040px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <header className="max-w-[640px] space-y-1.5">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-heading outline-none"
            >
              Actividades
            </h1>
            <p className="text-muted">
              La agenda del evento: competencias, talleres y sociales. Los pases se arman con estas
              actividades.
            </p>
          </header>
          {data && (
            <button type="button" className={styles.primaryLarge} onClick={openCreate}>
              <PlusIcon />
              Nueva actividad
            </button>
          )}
        </div>
        {state.status === 'loading' && <p role="status">Cargando actividades…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            {/* While the form is open its failures show inside the dialog instead. */}
            {!editor && <CatalogNotice notice={notice} onReload={refresh} />}
            <CatalogRefreshFailure failure={refreshFailure} onRetry={reload} />
            {editor && (
              <ActivityEditor
                key={editor.mode === 'edit' ? editor.activity.id : 'new'}
                activity={editor.mode === 'edit' ? editor.activity : undefined}
                activities={data.activities}
                venues={data.context.venues}
                timeZone={data.context.timeZone}
                eventWindow={data.context.eventWindow}
                enrolled={
                  editor.mode === 'edit' ? enrolledCount(data.enrolled, editor.activity) : undefined
                }
                passes={
                  editor.mode === 'edit' && data.passTypes
                    ? passNames(data.passTypes, editor.activity.id)
                    : null
                }
                windowProblem={windowProblem}
                notice={<CatalogNotice notice={notice} onReload={refresh} />}
                busy={busy}
                onClose={closeEditor}
                onSave={save}
              />
            )}
            {archiving && (
              <ActivityArchiveDialog
                activity={archiving}
                enrolled={enrolledCount(data.enrolled, archiving)}
                busy={busy}
                onCancel={() => setArchiving(null)}
                onConfirm={() => archive(archiving)}
              />
            )}
            {data.activities.length === 0 ? (
              <ActivitiesEmpty onCreate={openCreate} />
            ) : (
              <>
                <ActivityAgendaFilters
                  id={tabsId}
                  filters={filters}
                  tabCounts={tabCounts(data.activities)}
                  kinds={kindOptions(data.activities, filters.tab, filters.kind)}
                  onChange={setFilters}
                />
                {success && (
                  <ActivitySuccessNotice
                    text={success.text}
                    busy={busy}
                    onUndo={success.undo && undo(success.undo)}
                    onClose={() => setSuccess(null)}
                  />
                )}
                <section
                  role="tabpanel"
                  id={agendaPanelId(tabsId)}
                  aria-labelledby={agendaTabId(tabsId, filters.tab)}
                  className="min-w-0 space-y-5"
                >
                  <Agenda
                    activities={data.activities}
                    filters={filters}
                    timeZone={data.context.timeZone}
                    footer={agendaFooter(data.context.timeZone, data.context.eventWindow)}
                    onCreate={openCreate}
                  >
                    {(days) => (
                      <ActivityList
                        days={days}
                        activities={data.activities}
                        venueNames={venueNames}
                        enrolled={filters.tab === 'active' ? data.enrolled : null}
                        timeZone={data.context.timeZone}
                        busy={busy}
                        onEdit={(activity) => openEditor({ mode: 'edit', activity })}
                        onArchive={(activity) => {
                          setNotice(null);
                          setArchiving(activity);
                        }}
                        onRestore={(activity) => restore(activity)}
                      />
                    )}
                  </Agenda>
                </section>
              </>
            )}
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
  footer: string;
  onCreate: () => void;
  children: (days: AgendaDay[]) => ReactNode;
};

// Picks the right empty state, or renders the filtered days with the clock footer.
function Agenda({ activities, filters, timeZone, footer, onCreate, children }: AgendaProps) {
  const days = agendaDays(activities, filters, timeZone);
  if (days.length > 0)
    return (
      <>
        {children(days)}
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6v4l2.5 2" />
          </svg>
          {footer}
        </p>
      </>
    );
  const query = filters.query.trim();
  if (query)
    return (
      <AgendaEmpty
        title={`Ninguna actividad coincide con “${query}”`}
        text="Revisa cómo se escribe o quita el filtro de tipo."
      />
    );
  if (filters.kind !== null && tabCounts(activities)[filters.tab] > 0)
    return (
      <AgendaEmpty
        title="Ninguna actividad de este tipo"
        text="Quita el filtro de tipo para ver las demás."
      />
    );
  if (filters.tab === 'archived')
    return (
      <AgendaEmpty
        title="No hay actividades archivadas"
        text="Cuando archives una actividad aparecerá aquí y podrás restaurarla."
      />
    );
  return (
    <AgendaEmpty
      title="Aún no hay actividades"
      text="Agrega las competencias, talleres y sociales del evento. Después arma los pases con ellas."
      onCreate={onCreate}
    />
  );
}
