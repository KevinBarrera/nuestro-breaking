import {
  archivePassType,
  catalogFailure,
  createPassType,
  listActivities,
  listPassTypes,
  replacePassTypeActivities,
  restorePassType,
  updatePassType,
  type CatalogFailure,
  type CatalogPassType,
  type NewPassTypeInput,
  type PassTypeActivity,
  type PassTypeInput,
} from '@/entities/event-catalog';
import { type ReactNode, useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { passRestoreConflict } from './catalog-copy';
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
// other navigation drops the notice, so coming back later does not show a stale one.
type ScreenNotice = { at: string; notice: Notice };

// The client keeps only the status, and the form already validates the fields, so a 400 on a
// create with access most likely names an activity archived meanwhile; the copy says so
// without ruling out the fields.
const invalidActivityText =
  'No se pudo crear el pase: lo más probable es que alguna actividad elegida ya no esté activa en este evento. Recarga para ver las actividades actuales y revisa el acceso y los datos antes de guardar.';

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

  // Moving to another screen drops a notice filed for a different one (adjusted while
  // rendering, so the stale notice never paints on the new screen).
  const [shownAt, setShownAt] = useState(pathname);
  if (shownAt !== pathname) {
    setShownAt(pathname);
    if (notice && notice.at !== pathname) setNotice(null);
  }

  // Runs one write and resolves to whether it succeeded, so the screen can close its dialog.
  // On success it reports at `destination` (when given, it also goes there) and refreshes the
  // catalog. Failures stay on the screen that started the write, with the more specific
  // `failureText` message when it gives one.
  async function run<T>(
    action: () => Promise<T>,
    success: string,
    destination?: (result: T) => string,
    failureText?: (failure: CatalogFailure) => string | undefined,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    setAccessConflictFor(null);
    try {
      const result = await action();
      const to = destination?.(result);
      setNotice({ at: to ?? pathname, notice: { kind: 'success', text: success } });
      if (to) void navigate(to);
      reload();
      return true;
    } catch (error) {
      const failure = catalogFailure(error);
      const text = failureText?.(failure);
      setNotice({ at: pathname, notice: { kind: 'failure', failure, ...(text && { text }) } });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The new pass, with any access chosen on the create screen, opens on its own screen. It is
  // added in place first, so that screen finds it before the refreshed list arrives. A 400 with
  // access almost always means a chosen activity was archived meanwhile (`Invalid activity`).
  function create(input: NewPassTypeInput) {
    return run(
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
      (failure) =>
        failure === 'invalid' && input.activities?.length ? invalidActivityText : undefined,
    );
  }

  // The confirmed response (new version) is applied in place before the refresh, so the
  // screen reads as saved at once and a following access save sends the new version.
  function updatePass(passType: CatalogPassType, input: PassTypeInput) {
    const { id, version } = passType;
    return run(async () => {
      const saved = await updatePassType(eventId, id, version, input);
      replacePass(saved);
    }, 'Pase actualizado.');
  }

  function replacePass(saved: CatalogPassType) {
    update((data) => ({
      ...data,
      passTypes: data.passTypes.map((entry) => (entry.id === saved.id ? saved : entry)),
    }));
  }

  function archive(passType: CatalogPassType) {
    return run(
      () => archivePassType(eventId, passType.id, passType.version),
      'Pase archivado.',
      () => passListPath(eventId),
    );
  }

  // The restored pass (new version) is applied in place, so it moves to the main list at once
  // and the list screen can focus its card; the reload that follows refreshes the rest.
  function restore(passType: CatalogPassType) {
    return run(
      async () => replacePass(await restorePassType(eventId, passType.id, passType.version)),
      'Pase restaurado.',
      undefined,
      (failure) => (failure === 'conflict' ? passRestoreConflict : undefined),
    );
  }

  // Keeps the pass on screen and applies the confirmed response (new version) in place.
  async function saveAccess(
    passType: CatalogPassType,
    activities: PassTypeActivity[],
  ): Promise<boolean> {
    if (busy) return false;
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
      replacePass(saved);
      // The editor restarts from the confirmed links, whatever the response holds.
      setAccessReset((value) => value + 1);
      setNotice({ at: pathname, notice: { kind: 'success', text: 'Acceso actualizado.' } });
      return true;
    } catch (error) {
      const failure = catalogFailure(error);
      if (failure === 'conflict') setAccessConflictFor(passType.id);
      else setNotice({ at: pathname, notice: { kind: 'failure', failure } });
      return false;
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
    restore,
    saveAccess,
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
