import type { CatalogPassType, CatalogStatus } from '@/entities/event-catalog';
import { Breadcrumbs } from '@/shared/ui';
import { type Ref, useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { styles } from './catalog-copy';
import { PassEditor } from './pass-editor';
import { PlusIcon, WarningIcon } from './activity-icons';
import {
  misconfiguredNotice,
  noAccess,
  passGroups,
  passPanelId,
  passTabCounts,
  passTabId,
} from './pass-catalog-model';
import { PassesEmpty, PassList, PassTabs } from './pass-list';
import {
  activitiesPath,
  passDetailPath,
  passListPath,
  passNewPath,
  usePassesContext,
} from './passes-context';

const headerClass = 'space-y-2 border-b border-line pb-6';
const titleClass = 'text-3xl font-bold tracking-tight break-words text-heading';

type PassesHeaderProps = {
  eventId: string;
  canCreate?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
};

// The list header; "Nuevo pase" only shows once the catalog is readable. The heading takes
// focus after a restore, when the restored row leaves the Archivados tab.
export function PassesHeader({ eventId, canCreate = false, headingRef }: PassesHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <header className="max-w-[660px] space-y-1.5">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-extrabold tracking-tight text-heading outline-none"
        >
          Pases
        </h1>
        <p className="text-muted">
          Lo que el público compra. Cada pase tiene un precio y define a qué actividades da acceso.
        </p>
      </header>
      {canCreate && (
        <Link to={passNewPath(eventId)} className={styles.primaryLarge}>
          <PlusIcon />
          Nuevo pase
        </Link>
      )}
    </div>
  );
}

// Activos / Archivados tabs over the passes grouped by class. Archived rows restore right away
// (like Actividades); the restored row leaves the tab, so focus goes to the heading.
export function PassListScreen() {
  const { eventId, timeZone, passTypes, activities, sold, sales, busy, notices, restore } =
    usePassesContext();
  const [tab, setTab] = useState<CatalogStatus>('active');
  const [focusRequest, setFocusRequest] = useState(0);
  // The sale pill compares pass close dates with the time the list was opened.
  const [now] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabsId = useId();
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const groups = passGroups(passTypes, tab);
  const notice =
    tab === 'active'
      ? misconfiguredNotice(
          passTypes.filter(
            (passType) => passType.status === 'active' && noAccess(passType, activityById),
          ),
        )
      : null;

  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  async function restoreNow(passType: CatalogPassType) {
    if (await restore(passType)) setFocusRequest((value) => value + 1);
  }

  return (
    <>
      <PassesHeader eventId={eventId} canCreate headingRef={headingRef} />
      {notices}
      {passTypes.length === 0 ? (
        <PassesEmpty newPath={passNewPath(eventId)} activitiesPath={activitiesPath(eventId)} />
      ) : (
        <>
          <PassTabs id={tabsId} tab={tab} counts={passTabCounts(passTypes)} onChange={setTab} />
          <section
            role="tabpanel"
            id={passPanelId(tabsId)}
            aria-labelledby={passTabId(tabsId, tab)}
            className="min-w-0 space-y-5"
          >
            {notice && (
              <p
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-warning-fg bg-warning px-4 py-3 text-sm text-warning-fg"
              >
                <span className="mt-px shrink-0">
                  <WarningIcon size={18} />
                </span>
                <span>
                  <b>{notice.title}</b> {notice.text}
                </span>
              </p>
            )}
            {groups.length > 0 ? (
              <PassList
                groups={groups}
                activityById={activityById}
                sold={tab === 'active' ? sold : null}
                sales={sales}
                now={now}
                timeZone={timeZone}
                detailPath={(passTypeId) => passDetailPath(eventId, passTypeId)}
                busy={busy}
                onRestore={(passType) => void restoreNow(passType)}
              />
            ) : tab === 'archived' ? (
              <ListEmpty
                title="No hay pases archivados"
                text="Cuando archives un pase aparecerá aquí. Quien ya lo compró lo conserva."
              />
            ) : (
              <ListEmpty
                title="Aún no hay pases activos"
                text="Crea lo que vas a vender o restaura un pase desde Archivados."
              />
            )}
          </section>
        </>
      )}
    </>
  );
}

function ListEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <p className="font-bold text-heading">{title}</p>
      <p className="max-w-[440px] text-sm text-muted">{text}</p>
    </div>
  );
}

// A new pass sets its fields and access in one step and saves directly with "Crear pase".
export function PassCreateScreen() {
  const { create } = usePassesContext();
  return <PassEditor mode="new" onCreate={create} />;
}

// The edited pass is read from the latest data, so a save always sends its current version.
// The editor is keyed by the version of the last server read: a reload that brings a newer
// version remounts it with the server values instead of pairing a stale draft with the new
// expectedVersion, while our own writes (applied in place) keep the draft until the reload.
export function PassDetailScreen() {
  const { passTypeId } = useParams<'passTypeId'>();
  const context = usePassesContext();
  const selected = context.passTypes.find(
    (passType) => passType.id === passTypeId && passType.status === 'active',
  );
  if (!selected) return <PassNotFound eventId={context.eventId} />;
  const loadedVersion = context.loadedPassTypes.find(
    (passType) => passType.id === selected.id,
  )?.version;
  return (
    <PassEditor
      key={`${selected.id}:${loadedVersion ?? selected.version}`}
      mode="edit"
      passType={selected}
      onSave={(input, access) => context.save(selected, input, access)}
      onArchive={() => context.archive(selected)}
    />
  );
}

// An unknown id, or a pass that is archived (archived passes cannot be edited until they are
// restored from the list's "Archivados" section).
function PassNotFound({ eventId }: { eventId: string }) {
  return (
    <>
      <header className={headerClass}>
        <Breadcrumbs
          items={[{ label: 'Pases', to: passListPath(eventId) }, { label: 'Pase no encontrado' }]}
        />
        <h1 className={titleClass}>No encontramos este pase</h1>
      </header>
      <p className="text-muted">
        Puede que el enlace esté incompleto o que el pase esté archivado. Los pases archivados están
        en la pestaña «Archivados» de la lista de pases, donde puedes restaurarlos para volver a
        editarlos.
      </p>
      <Link to={passListPath(eventId)} className={`${styles.secondary} inline-flex items-center`}>
        Volver a Pases
      </Link>
    </>
  );
}
