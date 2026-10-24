import type {
  CatalogActivity,
  CatalogPassType,
  CatalogStatus,
  NewPassTypeInput,
  PassTypeActivity,
  PassTypeInput,
} from '@/entities/event-catalog';
import { Breadcrumbs, ReviewChangesDialog, UnsavedChangesGuard, type ChangeRow } from '@/shared/ui';
import { type Ref, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { styles } from './catalog-copy';
import { AccessList, AccessSection, PassAccessEditor } from './pass-access-list';
import {
  accessGroups,
  accessList,
  type AccessChoices,
  type AccessGroup,
} from './pass-access-model';
import { passAccessRows, passFieldRows } from './pass-changes';
import { PassTypeForm } from './pass-type-form';
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

// Activities in the access list's order, then the rest (archived), for the review rows.
const reviewOrder = (groups: AccessGroup[], activities: CatalogActivity[]) => [
  ...groups.flatMap((group) => group.activities),
  ...activities.filter((activity) => activity.status !== 'active'),
];

// A new pass sets its access in the same step: the form sends it with the single POST, after
// "Revisar cambios" lists every field and each activity it gives access to.
export function PassCreateScreen() {
  const { eventId, timeZone, activities, busy, notices, create } = usePassesContext();
  const navigate = useNavigate();
  const [choices, setChoices] = useState<AccessChoices>({});
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [review, setReview] = useState<{ input: NewPassTypeInput; rows: ChangeRow[] } | null>(null);
  const groups = accessGroups(activities);
  const dirty = fieldsDirty || accessList(groups, choices).length > 0;

  function openReview(fields: PassTypeInput) {
    const access = accessList(groups, choices);
    setReview({
      input: { ...fields, activities: access },
      rows: [
        ...passFieldRows(undefined, fields, timeZone),
        ...passAccessRows(reviewOrder(groups, activities), [], access),
      ],
    });
  }

  // A successful create moves to the new pass's screen, which unmounts this one.
  async function confirm(input: NewPassTypeInput) {
    await create(input);
    setReview(null);
  }

  return (
    <>
      <header className={headerClass}>
        <Breadcrumbs
          items={[{ label: 'Pases', to: passListPath(eventId) }, { label: 'Nuevo pase' }]}
        />
        <h1 className={titleClass}>Nuevo pase</h1>
      </header>
      {notices}
      <PassTypeForm
        title="Nuevo pase"
        heading="Datos del pase"
        timeZone={timeZone}
        busy={busy}
        onSubmit={openReview}
        onCancel={() => void navigate(passListPath(eventId))}
        onDirtyChange={setFieldsDirty}
        aside={
          <AccessSection
            level={2}
            intro="Todas empiezan sin acceso. Marca qué puede escoger o qué incluye este pase."
            className={styles.card}
          >
            <AccessList
              groups={groups}
              choices={choices}
              level={2}
              busy={busy}
              onChange={setChoices}
            />
          </AccessSection>
        }
      />
      <ReviewChangesDialog
        isOpen={review !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
        rows={review?.rows ?? []}
        onConfirm={() => {
          if (review) void confirm(review.input);
        }}
        isPending={busy}
      />
      <UnsavedChangesGuard when={dirty && !busy} />
    </>
  );
}

type DetailReview =
  | { kind: 'fields'; input: PassTypeInput; rows: ChangeRow[] }
  | { kind: 'access'; activities: PassTypeActivity[]; rows: ChangeRow[] };

// Identifies the saved access links, whatever their order.
const linksKey = (links: PassTypeActivity[]) =>
  links
    .map((link) => `${link.activityId}=${link.access}`)
    .sort()
    .join(',');

// The edited pass is read from the latest data, so a save always sends its current version;
// each confirmed write (field PATCH or access PUT) is applied in place with its new version.
// Fields and access keep their own save, each reviewed on its own: one write per review keeps
// the version chain simple, and a failure never leaves half of a combined save applied.
// The form is keyed by the version of the last server read: a reload that brings a newer
// version remounts it with the server values instead of pairing stale fields with the new
// expectedVersion, while our own writes (applied in place) keep unsaved field edits. The
// access editor is keyed by the saved links and `accessReset`, so a field save keeps unsaved
// access edits, while an access save, a conflict reload or a reload that changes the links
// resets it.
export function PassDetailScreen() {
  const { passTypeId } = useParams<'passTypeId'>();
  const context = usePassesContext();
  const navigate = useNavigate();
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [review, setReview] = useState<DetailReview | null>(null);
  const { eventId, busy, notices } = context;
  const selected = context.passTypes.find(
    (passType) => passType.id === passTypeId && passType.status === 'active',
  );
  if (!selected) return <PassNotFound eventId={eventId} />;
  const loadedVersion = context.loadedPassTypes.find(
    (passType) => passType.id === selected.id,
  )?.version;
  const groups = accessGroups(context.activities);

  // Failures close the review too, so the page or access alert is in view.
  async function confirm(current: DetailReview) {
    if (!selected) return;
    if (current.kind === 'fields') await context.update(selected, current.input);
    else await context.saveAccess(selected, current.activities);
    setReview(null);
  }

  return (
    <>
      <header className={headerClass}>
        <Breadcrumbs
          items={[{ label: 'Pases', to: passListPath(eventId) }, { label: selected.name }]}
        />
        <h1 className={titleClass}>{selected.name}</h1>
      </header>
      {notices}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <PassTypeForm
            key={`${selected.id}:${loadedVersion ?? selected.version}`}
            title="Editar pase"
            passType={selected}
            timeZone={context.timeZone}
            busy={busy}
            onSubmit={(input) =>
              setReview({
                kind: 'fields',
                input,
                rows: passFieldRows(selected, input, context.timeZone),
              })
            }
            onCancel={() => void navigate(passListPath(eventId))}
            onArchive={() => context.archive(selected)}
            onDirtyChange={setFieldsDirty}
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <PassAccessEditor
            key={`${selected.id}:${linksKey(selected.activities)}:${context.accessReset}`}
            groups={groups}
            passType={selected}
            busy={busy}
            conflict={context.accessConflictFor === selected.id}
            onSave={(activities) =>
              setReview({
                kind: 'access',
                activities,
                rows: passAccessRows(
                  reviewOrder(groups, context.activities),
                  selected.activities,
                  activities,
                ),
              })
            }
            onReload={context.reloadAccess}
            onDirtyChange={setAccessDirty}
          />
        </div>
      </div>
      <ReviewChangesDialog
        isOpen={review !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
        rows={review?.rows ?? []}
        onConfirm={() => {
          if (review) void confirm(review);
        }}
        isPending={busy}
      />
      <UnsavedChangesGuard when={(fieldsDirty || accessDirty) && !busy} />
    </>
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
