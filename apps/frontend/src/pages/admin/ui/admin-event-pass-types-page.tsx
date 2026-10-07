import {
  archivePassType,
  catalogFailure,
  createPassType,
  listActivities,
  listPassTypes,
  replacePassTypeActivities,
  updatePassType,
  type CatalogPassType,
  type PassTypeActivity,
  type PassTypeInput,
} from '@/entities/event-catalog';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { styles } from './catalog-copy';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { PassTypeAccessEditor } from './pass-type-access-editor';
import { PassTypeForm } from './pass-type-form';
import { PassTypeList } from './pass-type-list';
import { useCatalogLoad } from './use-catalog-load';

// The edited pass is kept by id and read from the latest data. Its forms are keyed by id and
// version, so a reload that brings a newer version remounts them with the server values instead
// of pairing stale field values with the new expectedVersion.
type Editor = { mode: 'create' } | { mode: 'edit'; passTypeId: string } | null;

export function AdminEventPassTypesPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <EventPassTypes key={eventId} eventId={eventId} />;
}

function EventPassTypes({ eventId }: { eventId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [passTypes, activities] = await Promise.all([
        listPassTypes(eventId, signal),
        listActivities(eventId, signal),
      ]);
      return { passTypes, activities };
    },
    [eventId],
  );
  const { state, reload } = useCatalogLoad(load);
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setEditor(null);
      setNotice({ kind: 'success', text: success });
      reload();
    } catch (error) {
      setNotice({ kind: 'failure', failure: catalogFailure(error) });
    } finally {
      setBusy(false);
    }
  }

  function save(selected: CatalogPassType | undefined, input: PassTypeInput) {
    if (selected) {
      const { id, version } = selected;
      void run(() => updatePassType(eventId, id, version, input), 'Pase actualizado.');
    } else {
      void run(() => createPassType(eventId, input), 'Pase creado.');
    }
  }

  function saveAccess(passType: CatalogPassType, activities: PassTypeActivity[]) {
    void run(
      () => replacePassTypeActivities(eventId, passType.id, passType.version, activities),
      'Acceso actualizado.',
    );
  }

  function open(next: Editor) {
    setNotice(null);
    setEditor(next);
  }

  function refresh() {
    open(null);
    reload();
  }

  const data = state.status === 'ready' ? state.data : null;
  const refreshFailure = state.status === 'ready' ? state.refreshFailure : null;
  const activityById = new Map(data?.activities.map((activity) => [activity.id, activity]));
  const selected =
    editor?.mode === 'edit'
      ? data?.passTypes.find(
          (passType) => passType.id === editor.passTypeId && passType.status === 'active',
        )
      : undefined;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-heading">Pases</h1>
            <p className="mt-1 text-sm text-muted">
              Qué se vende y a qué da acceso cada pase. Los cambios de precio no afectan lo ya
              vendido.
            </p>
          </div>
          {data && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => open({ mode: 'create' })}
            >
              Nuevo pase
            </button>
          )}
        </header>
        {state.status === 'loading' && <p role="status">Cargando pases…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            <CatalogNotice notice={notice} onReload={refresh} />
            <CatalogRefreshFailure failure={refreshFailure} onRetry={reload} />
            <section aria-label="Lista de pases">
              <PassTypeList
                passTypes={data.passTypes}
                activities={activityById}
                selectedId={selected?.id ?? null}
                busy={busy}
                onSelect={(passType) => open({ mode: 'edit', passTypeId: passType.id })}
              />
            </section>
            {(editor?.mode === 'create' || selected) && (
              <aside aria-label="Panel del pase" className="max-w-xl space-y-4">
                <PassTypeForm
                  key={selected ? `${selected.id}:${selected.version}` : 'new'}
                  title={selected ? 'Editar pase' : 'Nuevo pase'}
                  passType={selected}
                  busy={busy}
                  onSubmit={(input) => save(selected, input)}
                  onCancel={() => setEditor(null)}
                  onArchive={
                    selected &&
                    (() =>
                      void run(
                        () => archivePassType(eventId, selected.id, selected.version),
                        'Pase archivado.',
                      ))
                  }
                />
                {selected && (
                  <PassTypeAccessEditor
                    key={`access-${selected.id}:${selected.version}`}
                    passType={selected}
                    activities={data.activities}
                    busy={busy}
                    onSubmit={(activities) => saveAccess(selected, activities)}
                    onCancel={() => setEditor(null)}
                  />
                )}
              </aside>
            )}
          </>
        )}
      </div>
    </main>
  );
}
