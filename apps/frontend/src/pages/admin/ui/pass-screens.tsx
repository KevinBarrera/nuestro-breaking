import type {
  CatalogActivity,
  NewPassTypeInput,
  PassTypeActivity,
  PassTypeInput,
} from '@/entities/event-catalog';
import { Breadcrumbs, ReviewChangesDialog, UnsavedChangesGuard, type ChangeRow } from '@/shared/ui';
import { useState } from 'react';
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
import { PassTypeList } from './pass-type-list';
import { passDetailPath, passListPath, passNewPath, usePassesContext } from './passes-context';

const headerClass = 'space-y-2 border-b border-line pb-6';
const titleClass = 'text-3xl font-bold tracking-tight break-words text-heading';

type PassesHeaderProps = { eventId: string; canCreate?: boolean };

// The list header; "Nuevo pase" only shows once the catalog is readable.
export function PassesHeader({ eventId, canCreate = false }: PassesHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0">
        <h1 className={titleClass}>Pases</h1>
        <p className="mt-1 text-sm text-muted">
          Qué se vende y a qué da acceso cada pase. Los cambios de precio no afectan lo ya vendido.
        </p>
      </div>
      {canCreate && (
        <Link to={passNewPath(eventId)} className={`${styles.primary} inline-flex items-center`}>
          Nuevo pase
        </Link>
      )}
    </header>
  );
}

export function PassListScreen() {
  const { eventId, passTypes, activities, notices } = usePassesContext();
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  return (
    <>
      <PassesHeader eventId={eventId} canCreate />
      {notices}
      <section aria-label="Lista de pases">
        <PassTypeList
          passTypes={passTypes}
          activities={activityById}
          detailPath={(passTypeId) => passDetailPath(eventId, passTypeId)}
        />
      </section>
    </>
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
  const { eventId, activities, busy, notices, create } = usePassesContext();
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
        ...passFieldRows(undefined, fields),
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
      <div className="max-w-xl">
        <PassTypeForm
          title="Nuevo pase"
          busy={busy}
          onSubmit={openReview}
          onCancel={() => void navigate(passListPath(eventId))}
          onDirtyChange={setFieldsDirty}
        >
          <AccessSection
            level={3}
            intro="Elige qué actividades da este pase. Puedes cambiarlo después."
            className="border-t border-line pt-4"
          >
            <AccessList
              groups={groups}
              choices={choices}
              level={3}
              busy={busy}
              onChange={(activityId, choice) =>
                setChoices((current) => ({ ...current, [activityId]: choice }))
              }
            />
          </AccessSection>
        </PassTypeForm>
      </div>
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
            busy={busy}
            onSubmit={(input) =>
              setReview({ kind: 'fields', input, rows: passFieldRows(selected, input) })
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

// An unknown id, or a pass that is archived (archived passes cannot be edited).
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
        Puede que el enlace esté incompleto o que el pase esté archivado; los pases archivados ya no
        se pueden editar.
      </p>
      <Link to={passListPath(eventId)} className={`${styles.secondary} inline-flex items-center`}>
        Volver a Pases
      </Link>
    </>
  );
}
