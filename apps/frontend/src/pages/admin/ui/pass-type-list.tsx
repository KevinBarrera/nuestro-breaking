import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';
import { accessLabels, passClassLabels, passStatusLabels, styles } from './catalog-copy';

type PassTypeListProps = {
  passTypes: CatalogPassType[];
  activities: Map<string, CatalogActivity>;
  confirmingId: string | null;
  busy: boolean;
  onEdit: (passType: CatalogPassType) => void;
  onEditAccess: (passType: CatalogPassType) => void;
  onArchiveRequest: (passType: CatalogPassType) => void;
  onArchiveConfirm: (passType: CatalogPassType) => void;
  onArchiveCancel: () => void;
};

function activityLabel(activity: CatalogActivity | undefined) {
  if (!activity) return 'Actividad no disponible';
  return activity.status === 'archived' ? `${activity.name} (archivada)` : activity.name;
}

export function PassTypeList({
  passTypes,
  activities,
  confirmingId,
  busy,
  onEdit,
  onEditAccess,
  onArchiveRequest,
  onArchiveConfirm,
  onArchiveCancel,
}: PassTypeListProps) {
  if (passTypes.length === 0)
    return <p className="text-slate-300">Aún no hay pases para este evento.</p>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {passTypes.map((passType) => {
        const active = passType.status === 'active';
        return (
          <li key={passType.id} className={styles.card}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-semibold">{passType.name}</h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  active
                    ? 'border-emerald-700 bg-emerald-950 text-emerald-200'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >
                {passStatusLabels[passType.status]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-700 pt-4 text-sm">
              <div>
                <dt className="text-slate-400">Clase</dt>
                <dd className="mt-0.5 font-medium">{passClassLabels[passType.passClass]}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Precio</dt>
                <dd className="mt-0.5 font-medium">{formatMxn(passType.priceCents)}</dd>
              </div>
              {passType.requiresPassClass && (
                <div className="col-span-2">
                  <dt className="sr-only">Requisito</dt>
                  <dd className="font-medium text-amber-200">
                    Requiere pase {passClassLabels[passType.requiresPassClass]}
                  </dd>
                </div>
              )}
              <div className="col-span-2">
                <dt className="text-slate-400">Actividades</dt>
                <dd className="mt-0.5">
                  {passType.activities.length === 0 ? (
                    <span className="text-slate-300">Sin actividades vinculadas</span>
                  ) : (
                    <ul className="space-y-1">
                      {passType.activities.map((link) => (
                        <li key={link.activityId}>
                          {activityLabel(activities.get(link.activityId))} ·{' '}
                          {accessLabels[link.access]}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
            {active &&
              (confirmingId === passType.id ? (
                <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                  <p className="text-sm text-amber-200">
                    ¿Archivar {passType.name}? Ya no se podrá asignar a nuevas inscripciones.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      className={styles.danger}
                      onClick={() => onArchiveConfirm(passType)}
                    >
                      Confirmar archivo
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={styles.secondary}
                      onClick={onArchiveCancel}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-700 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondary}
                    onClick={() => onEdit(passType)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondary}
                    onClick={() => onEditAccess(passType)}
                  >
                    Editar acceso
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.danger}
                    onClick={() => onArchiveRequest(passType)}
                  >
                    Archivar
                  </button>
                </div>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
