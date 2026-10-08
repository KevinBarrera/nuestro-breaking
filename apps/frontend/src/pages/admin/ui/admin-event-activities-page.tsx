import {
  archiveActivity,
  catalogFailure,
  createActivity,
  listActivities,
  readCatalogEventContext,
  restoreActivity,
  updateActivity,
  type ActivityInput,
  type CatalogActivity,
  type CatalogFailure,
} from '@/entities/event-catalog';
import {
  buttonClass,
  ConfirmDialog,
  Modal,
  ReviewChangesDialog,
  type ChangeRow,
} from '@/shared/ui';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
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
import { activityRestoreConflict, styles } from './catalog-copy';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { useCatalogLoad } from './use-catalog-load';

type Editor = { mode: 'create' } | { mode: 'edit'; activity: CatalogActivity } | null;
type Review = { input: ActivityInput; rows: ChangeRow[] };
// After an archive or restore the button that opened the dialog is gone. Focus goes to the
// restored row's "Editar" (`editOf`) when it is shown, otherwise to the page heading.
type FocusRequest = { editOf: string | null };
type RunOptions<T> = {
  success: string;
  onSuccess?: (result: T) => void;
  // Safe copy for a 409 that is more specific than the generic conflict message.
  conflict?: string;
};

// A stale or missing record cannot be saved from these values, so its alert (with "Recargar")
// belongs on the page, not inside a dialog the person would have to close first.
const needsReload = (failure: CatalogFailure) => failure === 'conflict' || failure === 'not-found';

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
  const { state, reload, update } = useCatalogLoad(load);
  const formId = useId();
  const [editor, setEditor] = useState<Editor>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [archiving, setArchiving] = useState<CatalogActivity | null>(null);
  const [restoring, setRestoring] = useState<CatalogActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filters, setFilters] = useState<AgendaFilters>({
    kind: null,
    query: '',
    showArchived: false,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const agendaRef = useRef<HTMLElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  // An archived row loses its "Archivar" button and a restored row its "Restaurar" button, so
  // the confirmation dialog has nowhere to return focus. On the next frame (after the dialog's
  // own focus restore) a restored row's "Editar" takes it if it is shown; otherwise the page
  // heading does, and the success notice under it is announced.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => {
      const { editOf } = focusRequest;
      const edit = editOf
        ? agendaRef.current?.querySelector<HTMLButtonElement>(
            `[data-edit-activity="${CSS.escape(editOf)}"]`,
          )
        : null;
      (edit ?? headingRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  async function run<T>(action: () => Promise<T>, { success, onSuccess, conflict }: RunOptions<T>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      setEditor(null);
      setReview(null);
      setArchiving(null);
      setRestoring(null);
      setNotice({ kind: 'success', text: success });
      onSuccess?.(result);
      reload();
    } catch (error) {
      const failure = catalogFailure(error);
      const text = failure === 'conflict' ? conflict : undefined;
      setNotice({ kind: 'failure', failure, ...(text && { text }) });
      // Other failures go back to the form with the edits intact, where the alert is shown.
      setReview(null);
      setArchiving(null);
      setRestoring(null);
      if (needsReload(failure)) setEditor(null);
    } finally {
      setBusy(false);
    }
  }

  function save({ input }: Review) {
    if (editor?.mode === 'edit') {
      const { id, version } = editor.activity;
      void run(() => updateActivity(eventId, id, version, input), {
        success: 'Actividad actualizada.',
      });
    } else {
      void run(() => createActivity(eventId, input), { success: 'Actividad creada.' });
    }
  }

  function refresh() {
    closeEditor();
    reload();
  }

  const data = state.status === 'ready' ? state.data : null;
  const refreshFailure = state.status === 'ready' ? state.refreshFailure : null;
  const venueNames = new Map(data?.context.venues.map((venue) => [venue.id, venue.name]));

  function openEditor(next: Editor) {
    setNotice(null);
    setEditor(next);
  }

  // Esc and "Cancelar" discard the edits: the form unmounts and the dialog returns focus to the
  // button that opened it.
  function closeEditor() {
    setNotice(null);
    setReview(null);
    setEditor(null);
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="min-w-0">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-bold tracking-tight text-heading outline-none"
            >
              Actividades
            </h1>
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
            {/* While the form is open its failures show inside the dialog instead. */}
            {!editor && <CatalogNotice notice={notice} onReload={refresh} />}
            <CatalogRefreshFailure failure={refreshFailure} onRetry={reload} />
            {editor && (
              <Modal
                title={editor.mode === 'edit' ? 'Editar actividad' : 'Nueva actividad'}
                isOpen
                onOpenChange={(open) => {
                  if (!open && !busy) closeEditor();
                }}
                isKeyboardDismissDisabled={busy}
                actions={
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass('secondary')}
                      onClick={closeEditor}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      form={formId}
                      disabled={busy || data.context.venues.length === 0}
                      className={buttonClass('primary')}
                    >
                      Guardar
                    </button>
                  </>
                }
              >
                <div className="space-y-4 pb-1">
                  <CatalogNotice notice={notice} onReload={refresh} />
                  <ActivityForm
                    key={editor.mode === 'edit' ? editor.activity.id : 'new'}
                    id={formId}
                    title={editor.mode === 'edit' ? 'Editar actividad' : 'Nueva actividad'}
                    activity={editor.mode === 'edit' ? editor.activity : undefined}
                    venues={data.context.venues}
                    timeZone={data.context.timeZone}
                    busy={busy}
                    onReview={(input, rows) => {
                      setNotice(null);
                      setReview({ input, rows });
                    }}
                  />
                </div>
              </Modal>
            )}
            <ReviewChangesDialog
              isOpen={review !== null}
              onOpenChange={(open) => {
                if (!open && !busy) setReview(null);
              }}
              rows={review?.rows ?? []}
              onConfirm={() => {
                if (review) save(review);
              }}
              isPending={busy}
            />
            {archiving && (
              <ConfirmDialog
                isOpen
                onOpenChange={(open) => {
                  if (!open && !busy) setArchiving(null);
                }}
                title={`¿Archivar ${archiving.name}?`}
                consequence="Dejará de estar disponible para nuevos pases."
                confirmLabel="Archivar"
                pendingLabel="Archivando…"
                tone="destructive"
                isPending={busy}
                onConfirm={() =>
                  void run(() => archiveActivity(eventId, archiving.id, archiving.version), {
                    success: 'Actividad archivada.',
                    onSuccess: () => setFocusRequest({ editOf: null }),
                  })
                }
              />
            )}
            {restoring && (
              <ConfirmDialog
                isOpen
                onOpenChange={(open) => {
                  if (!open && !busy) setRestoring(null);
                }}
                title={`¿Restaurar ${restoring.name}?`}
                consequence="Volverá a estar activa y aparecerá de nuevo en los pases que todavía la incluyen."
                confirmLabel="Restaurar"
                pendingLabel="Restaurando…"
                isPending={busy}
                onConfirm={() =>
                  void run(() => restoreActivity(eventId, restoring.id, restoring.version), {
                    success: 'Actividad restaurada.',
                    conflict: activityRestoreConflict,
                    // Show the confirmed active row right away; the reload that follows
                    // refreshes the rest of the agenda.
                    onSuccess: (restored) => {
                      update((current) => ({
                        ...current,
                        activities: current.activities.map((activity) =>
                          activity.id === restored.id ? restored : activity,
                        ),
                      }));
                      setFocusRequest({ editOf: restored.id });
                    },
                  })
                }
              />
            )}
            <section
              ref={agendaRef}
              aria-label="Agenda de actividades"
              className="min-w-0 space-y-6"
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
                    busy={busy}
                    onEdit={(activity) => openEditor({ mode: 'edit', activity })}
                    onArchive={(activity) => {
                      setNotice(null);
                      setArchiving(activity);
                    }}
                    onRestore={(activity) => {
                      setNotice(null);
                      setRestoring(activity);
                    }}
                  />
                )}
              </Agenda>
            </section>
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
