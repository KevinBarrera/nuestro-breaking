import type { CatalogActivity } from '@/entities/event-catalog';
import { useId } from 'react';
import { formatTimeRange, type AgendaDay } from './activity-agenda-model';
import { activityKindLabel, activityStatusLabels, styles } from './catalog-copy';

type ActivityListProps = {
  days: AgendaDay[];
  venueNames: Map<string, string>;
  timeZone: string;
  busy: boolean;
  onEdit: (activity: CatalogActivity) => void;
  // Asks for confirmation; the page archives only after it.
  onArchive: (activity: CatalogActivity) => void;
};

type RowProps = Omit<ActivityListProps, 'days'> & { activity: CatalogActivity };

const countLabel = (count: number) => `${count} ${count === 1 ? 'actividad' : 'actividades'}`;

export function ActivityList({ days, ...rowProps }: ActivityListProps) {
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <AgendaDaySection key={day.key} day={day} {...rowProps} />
      ))}
    </div>
  );
}

function AgendaDaySection({
  day,
  ...rowProps
}: Omit<ActivityListProps, 'days'> & { day: AgendaDay }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 id={headingId} className="text-lg font-bold text-heading">
          {day.label}
        </h2>
        <span className="text-sm text-muted">{countLabel(day.activities.length)}</span>
      </div>
      <ul className="divide-y divide-row overflow-hidden rounded-xl border border-line bg-surface">
        {day.activities.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ activity, venueNames, timeZone, busy, onEdit, onArchive }: RowProps) {
  const active = activity.status === 'active';
  return (
    <li className="p-4">
      <div className="grid gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center">
        <p className="font-mono text-sm font-semibold text-fg">
          {formatTimeRange(activity, timeZone)}
        </p>
        <div className="min-w-0">
          <h3 className="font-bold break-words text-heading">{activity.name}</h3>
          <p className="mt-0.5 text-sm break-words text-muted">
            {venueNames.get(activity.venueId) ?? 'Sede no disponible'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-heading">
              {activityKindLabel(activity.kind)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                active
                  ? 'border-success-fg bg-success text-success-fg'
                  : 'border-line bg-row text-muted'
              }`}
            >
              {activityStatusLabels[activity.status]}
            </span>
          </div>
        </div>
        {active && (
          <div className="flex flex-wrap gap-2">
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
              onClick={() => onArchive(activity)}
            >
              Archivar
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
