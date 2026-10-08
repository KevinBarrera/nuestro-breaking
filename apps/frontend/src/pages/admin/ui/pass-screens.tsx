import { Breadcrumbs } from '@/shared/ui';
import { Link, useNavigate, useParams } from 'react-router';
import { styles } from './catalog-copy';
import { PassAccessMap } from './pass-access-map';
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

export function PassCreateScreen() {
  const { eventId, busy, notices, create } = usePassesContext();
  const navigate = useNavigate();
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
          onSubmit={create}
          onCancel={() => void navigate(passListPath(eventId))}
        />
      </div>
    </>
  );
}

// The edited pass is read from the latest data, so a save always sends its current version.
// The form is keyed by the version of the last server read: a reload that brings a newer
// version remounts it with the server values instead of pairing stale fields with the new
// expectedVersion, while our own access save (applied in place, only activity links change)
// keeps unsaved field edits. The access map is keyed by the current version, so a save resets it.
export function PassDetailScreen() {
  const { passTypeId } = useParams<'passTypeId'>();
  const context = usePassesContext();
  const navigate = useNavigate();
  const { eventId, busy, notices } = context;
  const selected = context.passTypes.find(
    (passType) => passType.id === passTypeId && passType.status === 'active',
  );
  if (!selected) return <PassNotFound eventId={eventId} />;
  const loadedVersion = context.loadedPassTypes.find(
    (passType) => passType.id === selected.id,
  )?.version;

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
            onSubmit={(input) => context.update(selected, input)}
            onCancel={() => void navigate(passListPath(eventId))}
            onArchive={() => context.archive(selected)}
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <PassAccessMap
            key={`${selected.id}:${selected.version}:${context.accessReset}`}
            passTypes={context.passTypes}
            activities={context.activities}
            selected={selected}
            busy={busy}
            conflict={context.accessConflictFor === selected.id}
            onSave={(activities) => context.saveAccess(selected, activities)}
            onReload={context.reloadAccess}
          />
        </div>
      </div>
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
