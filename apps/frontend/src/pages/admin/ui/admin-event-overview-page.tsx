import { listAdminEvents, type AdminEvent } from '@/entities/admin-event';
import {
  formatMxn,
  listActivities,
  listPassTypes,
  type CatalogActivity,
  type CatalogPassType,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { DataTable, TableChip, type TableColumn } from '@/shared/ui';
import { useCallback, useId } from 'react';
import { Link, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { CatalogLoadFailure } from './catalog-notice';
import { eventDates, eventZoneName } from './event-model';
import { catalogStats, describeAccess, passCountLabel } from './overview-model';
import { SalesSection } from './sales-section';
import { useCatalogLoad } from './use-catalog-load';

const eventPath = (pattern: string, eventId: string) => pattern.replace(':eventId', eventId);

export function AdminEventOverviewPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <EventOverview key={eventId} eventId={eventId} />;
}

function EventOverview({ eventId }: { eventId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [events, activities, passTypes] = await Promise.all([
        // The event facts are a nicety: a failed event list never blocks the catalog summary.
        listAdminEvents(signal).catch(() => []),
        listActivities(eventId, signal),
        listPassTypes(eventId, signal),
      ]);
      const event = events.find((candidate) => candidate.id === eventId) ?? null;
      return { event, activities, passTypes };
    },
    [eventId],
  );
  const { state } = useCatalogLoad(load);
  const data = state.status === 'ready' ? state.data : null;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-10">
      <div className="mx-auto max-w-[67.5rem] space-y-6">
        <header className="space-y-1.5 pb-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">
            Resumen del evento
          </h1>
          {data?.event && <EventFacts event={data.event} />}
        </header>
        {/* Venta en línea (wide) beside Catálogo (narrow); they stack when there is no room. */}
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 grow-2 basis-[32.5rem]">
            {/* Keyed so another event never shows, or saves over, the previous settings. */}
            <SalesSection key={eventId} eventId={eventId} />
          </div>
          <div className="min-w-0 grow basis-[17.5rem]">
            {state.status === 'loading' && <p role="status">Cargando resumen…</p>}
            {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
            {data && (
              <CatalogSummary
                eventId={eventId}
                activities={data.activities}
                passTypes={data.passTypes}
              />
            )}
          </div>
        </div>
        {data && (
          <PassTable eventId={eventId} activities={data.activities} passTypes={data.passTypes} />
        )}
      </div>
    </main>
  );
}

// The event name, its dates on the event clock and its city, under the page title.
function EventFacts({ event }: { event: AdminEvent }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
      <span className="font-semibold text-fg">{event.name}</span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarIcon />
        {eventDates(event)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PlaceIcon />
        {eventZoneName(event.timeZone)}
      </span>
    </p>
  );
}

const iconProps = {
  'aria-hidden': true,
  width: 16,
  height: 16,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0',
} as const;

const CalendarIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4.5" width="14" height="13" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </svg>
);

const PlaceIcon = () => (
  <svg {...iconProps}>
    <path d="M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </svg>
);

const ArrowIcon = () => (
  <svg {...iconProps}>
    <path d="M8 6l4 4-4 4" />
  </svg>
);

type CatalogProps = { activities: CatalogActivity[]; passTypes: CatalogPassType[] };

const statTargets = {
  passes: { route: routes.adminEventPasses, action: 'Ver pases' },
  activities: { route: routes.adminEventActivities, action: 'Ver actividades' },
};

function CatalogSummary({ eventId, activities, passTypes }: CatalogProps & { eventId: string }) {
  const titleId = useId();
  const stats = catalogStats(activities, passTypes);
  const hasActivities = stats.length > 1;
  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-4`}>
      <div className="space-y-1">
        <h2 id={titleId} className="text-xl font-extrabold text-heading">
          Catálogo
        </h2>
        <p className="text-sm text-muted">Lo que este evento ofrece.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Link
              to={eventPath(statTargets[stat.target].route, eventId)}
              className="flex items-center gap-3 rounded-lg bg-surface-inner p-4 text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[2rem] leading-9 font-extrabold tracking-tight text-heading">
                  {stat.count}
                </span>
                <span className="text-sm text-muted">{stat.label}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-link">
                {statTargets[stat.target].action}
                <ArrowIcon />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!hasActivities && <p className="text-sm text-muted">Aún no hay actividades activas.</p>}
    </section>
  );
}

function PassTable({ eventId, activities, passTypes }: CatalogProps & { eventId: string }) {
  const onSale = passTypes.filter((passType) => passType.status === 'active');
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const columns: TableColumn<CatalogPassType>[] = [
    {
      key: 'name',
      header: 'Pase',
      rowHeader: true,
      cell: (passType) => (
        <Link
          to={eventPath(routes.adminEventPass, eventId).replace(':passTypeId', passType.id)}
          className="inline-flex min-h-11 items-center rounded font-semibold text-fg hover:underline hover:underline-offset-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {passType.name}
        </Link>
      ),
    },
    {
      key: 'class',
      header: 'Clase',
      cell: (passType) => <TableChip>{passClassLabels[passType.passClass]}</TableChip>,
    },
    {
      key: 'access',
      header: 'Incluye',
      muted: true,
      cell: (passType) => describeAccess(passType, activityById),
    },
    {
      key: 'price',
      header: 'Precio',
      align: 'end',
      mono: true,
      cell: (passType) => formatMxn(passType.priceCents),
    },
  ];
  return (
    <DataTable
      title="Pases a la venta"
      description="Lo que el público puede comprar en línea."
      columns={columns}
      rows={onSale}
      rowKey={(passType) => passType.id}
      empty="Aún no hay pases a la venta."
      count={passCountLabel(onSale.length)}
      note="Precios en MXN"
    />
  );
}
