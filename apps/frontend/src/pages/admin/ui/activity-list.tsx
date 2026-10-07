import { formatEventTime, type CatalogActivity } from '@/entities/event-catalog';
import { activityStatusLabels, styles } from './catalog-copy';

type ActivityListProps = {
  activities: CatalogActivity[];
  venueNames: Map<string, string>;
  timeZone: string;
  confirmingId: string | null;
  busy: boolean;
  onEdit: (activity: CatalogActivity) => void;
  onArchiveRequest: (activity: CatalogActivity) => void;
  onArchiveConfirm: (activity: CatalogActivity) => void;
  onArchiveCancel: () => void;
};

export function ActivityList({
  activities,
  venueNames,
  timeZone,
  confirmingId,
  busy,
  onEdit,
  onArchiveRequest,
  onArchiveConfirm,
  onArchiveCancel,
}: ActivityListProps) {
  if (activities.length === 0)
    return <p className="text-muted">Aún no hay actividades para este evento.</p>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {activities.map((activity) => {
        const active = activity.status === 'active';
        return (
          <li key={activity.id} className={styles.card}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words text-lg font-semibold">{activity.name}</h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  active
                    ? 'border-success-fg bg-success text-success-fg'
                    : 'border-line bg-row text-muted'
                }`}
              >
                {activityStatusLabels[activity.status]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-muted">Tipo</dt>
                <dd className="mt-0.5 break-words font-medium">{activity.kind}</dd>
              </div>
              <div>
                <dt className="text-muted">Sede</dt>
                <dd className="mt-0.5 break-words font-medium">
                  {venueNames.get(activity.venueId) ?? 'Sede no disponible'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Inicio</dt>
                <dd className="mt-0.5 font-medium">
                  {formatEventTime(activity.startsAt, timeZone)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Fin</dt>
                <dd className="mt-0.5 font-medium">{formatEventTime(activity.endsAt, timeZone)}</dd>
              </div>
            </dl>
            {active &&
              (confirmingId === activity.id ? (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <p className="text-sm text-warning-fg">
                    ¿Archivar {activity.name}? Dejará de estar disponible para nuevos pases.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      className={styles.danger}
                      onClick={() => onArchiveConfirm(activity)}
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
                <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondary}
                    onClick={() => onEdit(activity)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.danger}
                    onClick={() => onArchiveRequest(activity)}
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
