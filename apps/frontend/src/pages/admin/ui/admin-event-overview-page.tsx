import {
  formatMxn,
  listActivities,
  listCatalogEvents,
  listPassTypes,
  type CatalogActivity,
  type CatalogPassType,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { useCallback, useId } from 'react';
import { Link, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { CatalogLoadFailure } from './catalog-notice';
import { catalogStats, describeAccess } from './overview-model';
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
        // The event name is a nicety: a failed event list never blocks the catalog summary.
        listCatalogEvents(signal).catch(() => []),
        listActivities(eventId, signal),
        listPassTypes(eventId, signal),
      ]);
      const eventName = events.find((event) => event.id === eventId)?.name ?? null;
      return { eventName, activities, passTypes };
    },
    [eventId],
  );
  const { state } = useCatalogLoad(load);
  const data = state.status === 'ready' ? state.data : null;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">
            Resumen del evento
          </h1>
          {data?.eventName && <p className="text-muted">{data.eventName}</p>}
        </header>
        <QuickActions eventId={eventId} />
        {state.status === 'loading' && <p role="status">Cargando resumen…</p>}
        {state.status === 'failed' && <CatalogLoadFailure failure={state.failure} />}
        {data && (
          <>
            <CatalogSummary
              eventId={eventId}
              activities={data.activities}
              passTypes={data.passTypes}
            />
            <PassTable activities={data.activities} passTypes={data.passTypes} />
          </>
        )}
      </div>
    </main>
  );
}

const actionCard =
  'flex min-h-36 flex-col justify-between gap-4 rounded-xl p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function QuickActions({ eventId }: { eventId: string }) {
  const titleId = useId();
  const upcoming = [
    { eyebrow: 'EFECTIVO', title: 'Registrar en el lugar', hint: 'Con número de recibo foliado' },
    { eyebrow: 'RESPALDO', title: 'Imprimir listas', hint: 'Por pase y actividad, sin contactos' },
  ];
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        Acciones rápidas
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
        <Link
          to={eventPath(routes.adminEventCheckIn, eventId)}
          className={`${actionCard} bg-primary text-primary-fg hover:opacity-90`}
        >
          <span className="text-xs font-bold tracking-[0.08em]">EN PUERTA</span>
          <span className="text-2xl leading-tight font-extrabold">Abrir check-in</span>
          <span className="text-sm">Busca por nombre, AKA, correo o folio</span>
        </Link>
        {upcoming.map((action) => (
          // Not wired yet: visibly unavailable and announced as disabled, never a link.
          <button
            key={action.title}
            type="button"
            aria-disabled="true"
            className={`${actionCard} cursor-not-allowed border border-line bg-surface text-muted`}
          >
            <span className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.08em]">
              {action.eyebrow}
              <span className="rounded bg-chip px-1.5 py-0.5 font-medium tracking-normal">
                Próximamente
              </span>
            </span>
            <span className="text-xl leading-tight font-extrabold">{action.title}</span>
            <span className="text-sm">{action.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type CatalogProps = { activities: CatalogActivity[]; passTypes: CatalogPassType[] };

function CatalogSummary({ eventId, activities, passTypes }: CatalogProps & { eventId: string }) {
  const titleId = useId();
  const stats = catalogStats(activities, passTypes);
  const hasActivities = stats.length > 1;
  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold text-heading">
          Catálogo
        </h2>
        <Link
          to={eventPath(routes.adminEventPassTypes, eventId)}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-link hover:text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Editar
        </Link>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {stats.map((stat) => (
          <li key={stat.label} className="flex flex-col gap-0.5 rounded-lg bg-surface-inner p-3">
            <span className="text-3xl font-extrabold text-heading">{stat.count}</span>
            <span className="text-sm text-muted">{stat.label}</span>
          </li>
        ))}
      </ul>
      {!hasActivities && <p className="text-sm text-muted">Aún no hay actividades activas.</p>}
    </section>
  );
}

function PassTable({ activities, passTypes }: CatalogProps) {
  const titleId = useId();
  const onSale = passTypes.filter((passType) => passType.status === 'active');
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-3">
        <h2 id={titleId} className="text-lg font-bold text-heading">
          Pases a la venta
        </h2>
        <span className="text-sm text-muted">Precios en MXN</span>
      </div>
      {onSale.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Aún no hay pases a la venta.</p>
      ) : (
        <div data-testid="pass-table-scroll" className="overflow-x-auto">
          <table aria-labelledby={titleId} className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-[0.06em] text-muted">
                <th scope="col" className="px-5 py-2.5 font-bold">
                  PASE
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  CLASE
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  INCLUYE
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-bold">
                  PRECIO
                </th>
              </tr>
            </thead>
            <tbody>
              {onSale.map((passType) => (
                <tr key={passType.id} className="border-b border-row last:border-b-0">
                  <th scope="row" className="px-5 py-3 text-left font-semibold">
                    {passType.name}
                  </th>
                  <td className="px-3 py-3 text-muted">{passClassLabels[passType.passClass]}</td>
                  <td className="px-3 py-3 text-muted">{describeAccess(passType, activityById)}</td>
                  <td className="px-5 py-3 text-right font-mono font-medium">
                    {formatMxn(passType.priceCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
