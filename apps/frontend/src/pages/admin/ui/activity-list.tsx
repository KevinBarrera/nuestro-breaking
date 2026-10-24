import type { CatalogActivity } from '@/entities/event-catalog';
import { useId } from 'react';
import {
  enrolledCount,
  enrolledLabel,
  formatTimeRange,
  overlapping,
  type AgendaDay,
} from './activity-agenda-model';
import { ArchiveIcon, RestoreIcon, WarningIcon } from './activity-icons';
import { activityKindLabel, styles } from './catalog-copy';

type ActivityListProps = {
  days: AgendaDay[];
  // Every activity of the event, to find overlaps outside the filtered days.
  activities: CatalogActivity[];
  venueNames: Map<string, string>;
  // Inscritos per activity; null hides the column (unknown, or the Archivadas tab).
  enrolled: Map<string, number> | null;
  timeZone: string;
  busy: boolean;
  onEdit: (activity: CatalogActivity) => void;
  // Asks for confirmation; the page archives only after it.
  onArchive: (activity: CatalogActivity) => void;
  // Restores right away: it is reversible from the notice.
  onRestore: (activity: CatalogActivity) => void;
};

type RowProps = Omit<ActivityListProps, 'days'> & { activity: CatalogActivity };

const countLabel = (count: number) => `${count} ${count === 1 ? 'actividad' : 'actividades'}`;

// The columns at full width; under 42rem (container query) the time takes its own line and the
// inscritos hide.
const rowGrid = (withEnrolled: boolean) =>
  `grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 pr-3 pl-4 @2xl:pr-4 @2xl:pl-5 ${
    withEnrolled
      ? '@2xl:grid-cols-[112px_minmax(0,1fr)_120px_auto]'
      : '@2xl:grid-cols-[112px_minmax(0,1fr)_auto]'
  }`;

export function ActivityList({ days, ...rowProps }: ActivityListProps) {
  return (
    <div className="@container space-y-7">
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
    <section aria-labelledby={headingId} className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h2 id={headingId} className="text-lg font-bold text-heading">
          {day.label}
        </h2>
        <span className="text-sm text-muted">{countLabel(day.activities.length)}</span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {day.activities.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({
  activity,
  activities,
  venueNames,
  enrolled,
  timeZone,
  busy,
  onEdit,
  onArchive,
  onRestore,
}: RowProps) {
  const active = activity.status === 'active';
  const overlap = overlapping(activity, activities)[0];
  const count = enrolledCount(enrolled, activity);
  return (
    <li className={rowGrid(enrolled !== null)}>
      <p className="col-span-full font-mono text-[15px] leading-[22px] font-medium text-fg @2xl:col-span-1">
        {formatTimeRange(activity, timeZone)}
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-bold break-words text-heading">{activity.name}</h3>
        <p className="text-sm break-words text-muted">
          {activityKindLabel(activity.kind)} ·{' '}
          {venueNames.get(activity.venueId) ?? 'Sede no disponible'}
        </p>
        {overlap && (
          <p className="inline-flex items-center gap-1.5 self-start rounded-full border border-warning-fg bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-fg">
            <WarningIcon />
            Mismo horario que {overlap.name}
          </p>
        )}
      </div>
      {enrolled !== null && (
        <p
          className={`hidden text-sm @2xl:block ${count ? 'font-semibold text-heading' : 'text-muted'}`}
        >
          {count === undefined ? null : enrolledLabel(count)}
        </p>
      )}
      <div className="flex items-center gap-1">
        {active ? (
          <>
            <button
              type="button"
              disabled={busy}
              className={styles.secondary}
              aria-label={`Editar ${activity.name}`}
              onClick={() => onEdit(activity)}
            >
              Editar
            </button>
            <button
              type="button"
              disabled={busy}
              title="Archivar"
              aria-label={`Archivar ${activity.name}`}
              className="flex size-11 items-center justify-center rounded-lg text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
              onClick={() => onArchive(activity)}
            >
              <ArchiveIcon />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={`${styles.secondary} inline-flex items-center gap-2`}
            aria-label={`Restaurar ${activity.name}`}
            onClick={() => onRestore(activity)}
          >
            <RestoreIcon />
            Restaurar
          </button>
        )}
      </div>
    </li>
  );
}
