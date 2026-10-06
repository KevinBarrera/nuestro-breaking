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
import { CatalogLoadFailure, CatalogNotice, type Notice } from './catalog-notice';
import { CatalogPageHeader } from './catalog-page-header';
import { PassTypeAccessEditor } from './pass-type-access-editor';
import { PassTypeForm } from './pass-type-form';
import { PassTypeList } from './pass-type-list';
import { useCatalogLoad } from './use-catalog-load';

type Editor =
  | { mode: 'create' }
  | { mode: 'edit'; passType: CatalogPassType }
  | { mode: 'access'; passType: CatalogPassType }
  | null;

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

  function save(input: PassTypeInput) {
    if (editor?.mode === 'edit') {
      const { id, version } = editor.passType;
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
    setConfirmingId(null);
    setEditor(next);
  }

  function refresh() {
    open(null);
    reload();
  }

  const data = state.status === 'ready' ? state.data : null;
  const activityById = new Map(data?.activities.map((activity) => [activity.id, activity]));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <CatalogPageHeader eventId={eventId} title="Pases" current="pass-types" />
        {state.status === 'loading' && <p role="status">Cargando pases…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            <CatalogNotice notice={notice} onReload={refresh} />
            {editor?.mode === 'access' ? (
              <PassTypeAccessEditor
                key={editor.passType.id}
                passType={editor.passType}
                activities={data.activities}
                busy={busy}
                onSubmit={(activities) => saveAccess(editor.passType, activities)}
                onCancel={() => setEditor(null)}
              />
            ) : editor ? (
              <PassTypeForm
                key={editor.mode === 'edit' ? editor.passType.id : 'new'}
                title={editor.mode === 'edit' ? 'Editar pase' : 'Nuevo pase'}
                passType={editor.mode === 'edit' ? editor.passType : undefined}
                busy={busy}
                onSubmit={save}
                onCancel={() => setEditor(null)}
              />
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => open({ mode: 'create' })}
              >
                Nuevo pase
              </button>
            )}
            <section aria-label="Lista de pases">
              <PassTypeList
                passTypes={data.passTypes}
                activities={activityById}
                confirmingId={confirmingId}
                busy={busy}
                onEdit={(passType) => open({ mode: 'edit', passType })}
                onEditAccess={(passType) => open({ mode: 'access', passType })}
                onArchiveRequest={(passType) => {
                  open(null);
                  setConfirmingId(passType.id);
                }}
                onArchiveConfirm={(passType) =>
                  void run(
                    () => archivePassType(eventId, passType.id, passType.version),
                    'Pase archivado.',
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
