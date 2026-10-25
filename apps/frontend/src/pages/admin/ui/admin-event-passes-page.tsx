import { fetchAttendeeLists } from '@/entities/attendee-list';
import {
  archivePassType,
  catalogFailure,
  createPassType,
  listActivities,
  listPassTypes,
  readCatalogEventContext,
  replacePassTypeActivities,
  restorePassType,
  updatePassType,
  type CatalogFailure,
  type CatalogPassType,
  type NewPassTypeInput,
  type PassTypeActivity,
  type PassTypeInput,
} from '@/entities/event-catalog';
import { getEventSales } from '@/entities/event-sales';
import { type ReactNode, useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { ActivitySuccessNotice } from './activity-feedback';
import { failureMessages, passRestoreConflict } from './catalog-copy';
import {
  CatalogLoadFailure,
  CatalogNotice,
  CatalogRefreshFailure,
  type Notice,
} from './catalog-notice';
import { soldCounts } from './pass-catalog-model';
import { PassesHeader } from './pass-screens';
import {
  passDetailPath,
  passListPath,
  type PassesContext,
  type SaveResult,
} from './passes-context';
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

// The PATCH went through and the PUT did not: say which half is saved, then why.
// A conflict means someone else changed the pass: only a reload (which drops the access edits)
// can fix it, so that case does not ask to save again.
const partialSaveText = (name: string, failure: CatalogFailure) =>
  `Se guardaron los datos de ${name}, pero no el acceso a actividades. ${failureMessages[failure]}${
    failure === 'conflict'
      ? ''
      : ' Tus cambios de acceso siguen en pantalla; revísalos y vuelve a guardar.'
  }`;

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
      const [passTypes, activities, event, sold, sales] = await Promise.all([
        listPassTypes(eventId, signal),
        listActivities(eventId, signal),
        readCatalogEventContext(eventId, signal),
        // Vendidos come from the attendee-lists snapshot and the sale pill reads the event's
        // online sale; without them the column hides and only the pass date decides the pill.
        fetchAttendeeLists(eventId, signal).then(soldCounts, () => null),
        getEventSales(eventId, signal).catch(() => null),
      ]);
      return {
        passTypes,
        activities,
        timeZone: event.timeZone,
        eventWindow: event.eventWindow,
        sold,
        sales,
      };
    },
    [eventId],
  );
  const { state, reload, update } = useCatalogLoad(load);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

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
    success: string | ((result: T) => string),
    destination?: (result: T) => string,
    failureText?: (failure: CatalogFailure) => string | undefined,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      const to = destination?.(result);
      const text = typeof success === 'string' ? success : success(result);
      setNotice({ at: to ?? pathname, notice: { kind: 'success', text } });
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
      (created) => `Creaste ${created.name}. Ya está en venta.`,
      (created) => passDetailPath(eventId, created.id),
      (failure) =>
        failure === 'invalid' && input.activities?.length ? invalidActivityText : undefined,
    );
  }

  // One save for the fields and the access: the PATCH first (when the fields changed), then the
  // PUT with the version the PATCH returned. Each confirmed response is applied in place. When
  // the PUT fails after the PATCH, the fields stay saved and no reload runs, so the editor keeps
  // the access edits for another try (a reload would bring the new version and reset it).
  async function save(
    passType: CatalogPassType,
    input: PassTypeInput | null,
    access: PassTypeActivity[] | null,
  ): Promise<SaveResult> {
    if (busy) return { status: 'failed' };
    setBusy(true);
    setNotice(null);
    let current = passType;
    try {
      try {
        if (input) {
          current = await updatePassType(eventId, current.id, current.version, input);
          replacePass(current);
        }
      } catch (error) {
        setNotice({ at: pathname, notice: { kind: 'failure', failure: catalogFailure(error) } });
        return { status: 'failed' };
      }
      try {
        if (access) {
          current = await replacePassTypeActivities(eventId, current.id, current.version, access);
          replacePass(current);
        }
      } catch (error) {
        const failure = catalogFailure(error);
        setNotice({
          at: pathname,
          notice: input
            ? { kind: 'failure', failure, text: partialSaveText(current.name, failure) }
            : { kind: 'failure', failure },
        });
        return input ? { status: 'partial', passType: current } : { status: 'failed' };
      }
      setNotice({
        at: pathname,
        notice: { kind: 'success', text: `Guardaste los cambios de ${current.name}.` },
      });
      reload();
      return { status: 'saved', passType: current };
    } finally {
      setBusy(false);
    }
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
      `Archivaste ${passType.name}.`,
      () => passListPath(eventId),
    );
  }

  // The restored pass (new version) is applied in place, so it moves to the main list at once
  // and the list screen can focus its card; the reload that follows refreshes the rest.
  function restore(passType: CatalogPassType) {
    return run(
      async () => replacePass(await restorePassType(eventId, passType.id, passType.version)),
      `Restauraste ${passType.name}. Vuelve a estar en venta.`,
      undefined,
      (failure) => (failure === 'conflict' ? passRestoreConflict : undefined),
    );
  }

  function refresh() {
    setNotice(null);
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

  const shown = notice?.at === pathname ? notice.notice : null;
  const context: PassesContext = {
    eventId,
    timeZone: state.data.timeZone,
    eventWindow: state.data.eventWindow,
    sold: state.data.sold,
    sales: state.data.sales,
    passTypes: state.data.passTypes,
    activities: state.data.activities,
    loadedPassTypes: state.loaded.passTypes,
    busy,
    notices: (
      <>
        {shown?.kind === 'success' ? (
          <ActivitySuccessNotice text={shown.text} busy={busy} onClose={() => setNotice(null)} />
        ) : (
          <CatalogNotice notice={shown} onReload={refresh} />
        )}
        <CatalogRefreshFailure failure={state.refreshFailure} onRetry={reload} />
      </>
    ),
    create,
    save,
    archive,
    restore,
  };

  return (
    <PassesMain>
      <Outlet context={context} />
    </PassesMain>
  );
}

function PassesMain({ children }: { children: ReactNode }) {
  return (
    <main className="@container px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="mx-auto max-w-[1120px] space-y-5">{children}</div>
    </main>
  );
}
