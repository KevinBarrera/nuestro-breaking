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
import { type ReactNode, useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { PassesHeader } from './pass-screens';
import { passDetailPath, passListPath, type PassesContext } from './passes-context';
import { useCatalogLoad } from './use-catalog-load';

// A notice belongs to the screen it was raised for: a write that moves to another screen
// (create → detail, archive → list) files its notice under the destination path, and any
// other navigation leaves the notice behind.
type ScreenNotice = { at: string; notice: Notice };

// Layout route for the pass list, create and detail screens: it reads the catalog once and
// runs every write, so moving between the screens keeps the data and the notices.
export function AdminEventPassesPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <EventPasses key={eventId} eventId={eventId} />;
}

function EventPasses({ eventId }: { eventId: string }) {
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
  const { state, reload, update } = useCatalogLoad(load);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [accessConflictFor, setAccessConflictFor] = useState<string | null>(null);
  const [accessReset, setAccessReset] = useState(0);

  // Runs one write; on success it reports at `destination` (when given, it also goes there)
  // and refreshes the catalog. Failures stay on the screen that started the write.
  async function run<T>(
    action: () => Promise<T>,
    success: string,
    destination?: (result: T) => string,
  ) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setAccessConflictFor(null);
    try {
      const result = await action();
      const to = destination?.(result);
      setNotice({ at: to ?? pathname, notice: { kind: 'success', text: success } });
      if (to) void navigate(to);
      reload();
    } catch (error) {
      setNotice({ at: pathname, notice: { kind: 'failure', failure: catalogFailure(error) } });
    } finally {
      setBusy(false);
    }
  }

  // The new pass opens on its own screen so its access can be set next. It is added in place
  // first, so that screen finds it before the refreshed list arrives.
  function create(input: PassTypeInput) {
    void run(
      async () => {
        const created = await createPassType(eventId, input);
        update((data) => ({
          ...data,
          passTypes: [...data.passTypes.filter((entry) => entry.id !== created.id), created],
        }));
        return created;
      },
      'Pase creado.',
      (created) => passDetailPath(eventId, created.id),
    );
  }

  function updatePass(passType: CatalogPassType, input: PassTypeInput) {
    const { id, version } = passType;
    void run(() => updatePassType(eventId, id, version, input), 'Pase actualizado.');
  }

  function archive(passType: CatalogPassType) {
    void run(
      () => archivePassType(eventId, passType.id, passType.version),
      'Pase archivado.',
      () => passListPath(eventId),
    );
  }

  // Keeps the pass on screen and applies the confirmed response (new version) in place.
  async function saveAccess(passType: CatalogPassType, activities: PassTypeActivity[]) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setAccessConflictFor(null);
    try {
      const saved = await replacePassTypeActivities(
        eventId,
        passType.id,
        passType.version,
        activities,
      );
      update((data) => ({
        ...data,
        passTypes: data.passTypes.map((entry) => (entry.id === saved.id ? saved : entry)),
      }));
      setNotice({ at: pathname, notice: { kind: 'success', text: 'Acceso actualizado.' } });
    } catch (error) {
      const failure = catalogFailure(error);
      if (failure === 'conflict') setAccessConflictFor(passType.id);
      else setNotice({ at: pathname, notice: { kind: 'failure', failure } });
    } finally {
      setBusy(false);
    }
  }

  function reloadAccess() {
    setNotice(null);
    setAccessConflictFor(null);
    setAccessReset((value) => value + 1);
    reload();
  }

  function refresh() {
    setNotice(null);
    setAccessConflictFor(null);
    reload();
  }

  if (state.status !== 'ready')
    return (
      <PassesMain>
        <PassesHeader eventId={eventId} />
        {state.status === 'loading' && <p role="status">Cargando pases…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
      </PassesMain>
    );

  const context: PassesContext = {
    eventId,
    passTypes: state.data.passTypes,
    activities: state.data.activities,
    loadedPassTypes: state.loaded.passTypes,
    busy,
    notices: (
      <>
        <CatalogNotice notice={notice?.at === pathname ? notice.notice : null} onReload={refresh} />
        <CatalogRefreshFailure failure={state.refreshFailure} onRetry={reload} />
      </>
    ),
    accessConflictFor,
    accessReset,
    create,
    update: updatePass,
    archive,
    saveAccess: (passType, activities) => void saveAccess(passType, activities),
    reloadAccess,
  };

  return (
    <PassesMain>
      <Outlet context={context} />
    </PassesMain>
  );
}

function PassesMain({ children }: { children: ReactNode }) {
  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-6">{children}</div>
    </main>
  );
}
